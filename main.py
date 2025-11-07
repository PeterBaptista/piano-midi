import os
import zipfile
import io
import tempfile
from flask import Flask, jsonify, send_file
from dotenv import load_dotenv
from musicai_sdk import MusicAiClient
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH


# Load environment variables
load_dotenv()

app = Flask(__name__)

MUSICAI_API_KEY = os.getenv("MUSICAI_API_KEY")
music_ai = MusicAiClient(api_key=MUSICAI_API_KEY)

print(f"MusicAI API Key: {MUSICAI_API_KEY}")


@app.route("/workflows", methods=["GET"])
def list_workflows():
    """Return all available MusicAI workflows."""
    try:
        workflows = music_ai.list_workflows()

        # handle if API returns dict instead of list
        if isinstance(workflows, dict) and "data" in workflows:
            workflows = workflows["data"]

        formatted = []
        for w in workflows:
            try:
                slug = w.get("slug") if isinstance(w, dict) else w["slug"]
                name = w.get("name") if isinstance(w, dict) else w["name"]
                formatted.append({"slug": slug, "name": name})
            except Exception:
                pass

        return jsonify({"workflows": formatted})
    except Exception as e:
        print("[ERROR] Could not list workflows:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/separate", methods=["GET"])
def separate_music():
    try:
        input_path = "./radiohead.m4a"

        if not os.path.exists(input_path):
            return jsonify({"error": "Arquivo radiohead.m4a não encontrado"}), 404


        print("[INFO] Uploading file to MusicAI...")
        song_url = music_ai.upload_file(input_path)

        print("[INFO] Creating separation job...")
        try:
            job = music_ai.add_job(
                "All stems",
                "teste-pedro",  # ✅ your actual workflow slug
                {"inputUrl": song_url},
            )

        except Exception as e:
            print("[ERROR] Error creating job:", e)
            print("\n[INFO] Listing available workflows:")
            return list_workflows()

        job_id = job["id"]
        print(f"[INFO] Waiting for job {job_id} to complete...")
        job_result = music_ai.wait_for_job_completion(job_id)

        if job_result["status"] != "SUCCEEDED":
            print("[ERROR] Job failed:", job_result)
            return jsonify({"error": "MusicAI job failed", "details": job_result}), 500

        print("[INFO] Downloading separated stems...")

        # 1. Create a temporary directory for all files
        with tempfile.TemporaryDirectory() as output_dir:
            
            # Download files from SDK into the temporary directory
            # result_files is a DICT: {'stems.bass': '/path/to/stems.bass.wav', ...}
            result_files = music_ai.download_job_results(job_result, output_dir)
            print(f"[INFO] Files returned by SDK: {result_files}")

            
            # ✅ --- START: Basic Pitch MIDI Generation --- ✅
            print("[INFO] Generating MIDI files with Basic Pitch...")
            
            # We iterate over the .values() which are the full file paths
            for stem_path in result_files.values():
                # Create the output path for the MIDI file
                # e.g., /tmp/xyz/stems.bass.wav -> /tmp/xyz/stems.bass.mid
                midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
                midi_output_path = os.path.join(output_dir, midi_file_name)

                print(f"[DEBUG] Generating MIDI for: {stem_path}")
                try:
                    # Run the Basic Pitch prediction
                    # This is the slow, CPU-intensive part
                    model_output, midi_data, note_events = predict(
                        stem_path, 
                        ICASSP_2022_MODEL_PATH
                    )
                    
                    # Save the MIDI file to the same temp directory
                    midi_data.write(midi_output_path)
                    print(f"[DEBUG] Saved MIDI to: {midi_output_path}")

                except Exception as e:
                    # If one stem fails (e.g., silence), log it and continue
                    print(f"[WARN] Could not generate MIDI for {stem_path}: {e}")
            
            print("[INFO] MIDI generation complete.")
            # ✅ --- END: Basic Pitch MIDI Generation --- ✅


            # 2. Create an in-memory byte buffer
            memory_zip = io.BytesIO()

            # 3. Create the ZIP file in the in-memory buffer
            print("[INFO] Zipping all files (stems + MIDI)...")
            with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
                
                # ✅ --- MODIFIED ZIP LOGIC --- ✅
                # Zip *everything* in the output_dir (stems and new .mid files)
                for file_name in os.listdir(output_dir):
                    full_file_path = os.path.join(output_dir, file_name)
                    # 'file_name' will be used as the name inside the zip
                    zipf.write(full_file_path, arcname=file_name)
                    print(f"[DEBUG] Added to zip: {file_name}")
                # ✅ --- END MODIFIED ZIP LOGIC --- ✅
            
            # 4. Rewind the buffer
            memory_zip.seek(0)

        # 5. (Automatic) Temp dir is deleted
        
        print("[INFO] In-memory ZIP created, sending to user...")

        # 6. Send the in-memory ZIP file
        return send_file(
            memory_zip,
            mimetype="application/zip",
            as_attachment=True,
            download_name="stems_and_midi.zip" # Updated download name
        )
        
    except Exception as e:
        print("[ERROR]", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)