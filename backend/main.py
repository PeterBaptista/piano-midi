import os
import zipfile
import io
import tempfile
from flask import Flask, jsonify, send_file
from dotenv import load_dotenv
from musicai_sdk import MusicAiClient
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import pretty_midi


# ------------------------
# Setup and configuration
# ------------------------
load_dotenv()
app = Flask(__name__)

MUSICAI_API_KEY = os.getenv("MUSICAI_API_KEY")
music_ai = MusicAiClient(api_key=MUSICAI_API_KEY)



# ------------------------
# Utility functions
# ------------------------

def generate_midi_from_audio(stem_path: str, output_dir: str) -> str:
    """
    Generate a normalized MIDI file from an audio stem using Basic Pitch + PrettyMIDI.
    Returns the path to the saved MIDI file.
    """
    midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
    midi_output_path = os.path.join(output_dir, midi_file_name)

    print(f"[DEBUG] Generating MIDI for: {stem_path}")
    try:
        model_output, midi_data, note_events = predict(stem_path, ICASSP_2022_MODEL_PATH)

        # Convert to PrettyMIDI
        midi_buffer = io.BytesIO()
        midi_data.write(midi_buffer)
        midi_buffer.seek(0)
        pm = pretty_midi.PrettyMIDI(midi_buffer)

        # Normalize
        uniform_velocity = 80
        uniform_instrument = 0  # Acoustic Grand Piano

        for instrument in pm.instruments:
            instrument.program = uniform_instrument
            for note in instrument.notes:
                note.velocity = uniform_velocity

        pm.write(midi_output_path)
        print(f"[DEBUG] Saved MIDI to: {midi_output_path}")
        return midi_output_path

    except Exception as e:
        print(f"[WARN] Could not generate MIDI for {stem_path}: {e}")
        return None


def create_zip_with_midi(result_files: dict) -> io.BytesIO:
    """
    Given a dict of result files from MusicAI, generates MIDI files,
    zips all files (stems + MIDI), and returns a BytesIO buffer ready for download.
    """
    with tempfile.TemporaryDirectory() as output_dir:
        # Download files locally
        print("[INFO] Downloading job result files...")
        local_files = music_ai.download_job_results(result_files, output_dir)
        print(f"[INFO] Downloaded: {local_files}")

        # Generate MIDI files
        print("[INFO] Generating MIDI files...")
        for stem_path in local_files.values():
            generate_midi_from_audio(stem_path, output_dir)

        # Create in-memory ZIP
        print("[INFO] Zipping all files (stems + MIDI)...")
        memory_zip = io.BytesIO()
        with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_name in os.listdir(output_dir):
                full_path = os.path.join(output_dir, file_name)
                zipf.write(full_path, arcname=file_name)
                print(f"[DEBUG] Added to ZIP: {file_name}")
        memory_zip.seek(0)

        return memory_zip



# ------------------------
# Routes
# ------------------------

@app.route("/workflows", methods=["GET"])
def list_workflows():
    """Return all available MusicAI workflows."""
    try:
        workflows = music_ai.list_workflows()
        if isinstance(workflows, dict) and "data" in workflows:
            workflows = workflows["data"]

        formatted = [{"slug": w.get("slug"), "name": w.get("name")} for w in workflows]
        return jsonify({"workflows": formatted})
    except Exception as e:
        print("[ERROR] Could not list workflows:", e)
        return jsonify({"error": str(e)}), 500



@app.route("/separate", methods=["GET"])
def separate_music():
    """Upload a local test file to MusicAI, separate stems, and return ZIP with stems + MIDI."""
    try:
        input_path = "./music-ai-test.m4a"
        if not os.path.exists(input_path):
            return jsonify({"error": "Arquivo music-ai-test.m4a não encontrado"}), 404

        print("[INFO] Uploading file to MusicAI...")
        song_url = music_ai.upload_file(input_path)

        print("[INFO] Creating separation job...")
        job = music_ai.add_job("All stems", "teste-pedro", {"inputUrl": song_url})
        job_id = job["id"]

        print(f"[INFO] Waiting for job {job_id} to complete...")
        job_result = music_ai.wait_for_job_completion(job_id)

        if job_result["status"] != "SUCCEEDED":
            return jsonify({"error": "MusicAI job failed", "details": job_result}), 500

        print("[INFO] Creating ZIP with stems and MIDI...")
        memory_zip = create_zip_with_midi(job_result)

        return send_file(
            memory_zip,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"stems_and_midi_{job_id}.zip"
        )

    except Exception as e:
        print("[ERROR]", e)
        return jsonify({"error": str(e)}), 500



@app.route("/download/<job_id>", methods=["GET"])
def download_existing_job(job_id):
    """Download and process an existing MusicAI job by ID."""
    try:
        print(f"[INFO] Fetching job {job_id} results...")
        job_result = music_ai.get_job(job_id)

        if job_result["status"] != "SUCCEEDED":
            return jsonify({
                "error": f"Job {job_id} not completed successfully",
                "status": job_result["status"]
            }), 400

        print("[INFO] Downloading job results and creating ZIP...")
        memory_zip = create_zip_with_midi(job_result)

        return send_file(
            memory_zip,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"stems_and_midi_{job_id}.zip"
        )

    except Exception as e:
        print("[ERROR]", e)
        return jsonify({"error": str(e)}), 500



# ------------------------
# Run server
# ------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
