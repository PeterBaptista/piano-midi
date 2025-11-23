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

# --- NOVO ---
# Limite em segundos para fundir notas.
# Se o intervalo entre notas for menor ou igual a este, elas serão fundidas.
# Este é o "quão rápido é a repetição" que você mencionou.
MERGE_NOTE_GAP_SECONDS = 0.08


# ------------------------
# Utility functions
# ------------------------

# --- NOVO ---
def merge_repeated_notes(notes: list, max_gap: float) -> list:
    """
    Funde notas consecutivas do mesmo tom se o intervalo entre elas
    for menor ou igual a max_gap.
    """
    if not notes:
        return []

    

    # Garante que as notas estejam ordenadas pelo tempo de início
    notes.sort(key=lambda n: n.start)

    merged_notes = []
    # Começa com a primeira nota como a base para a fusão
    current_merged_note = notes[0]

    for next_note in notes[1:]:
        # 1. Verifica se é o mesmo tom
        is_same_pitch = (next_note.pitch == current_merged_note.pitch)
        
        # 2. Verifica se o intervalo é pequeno (ou se há sobreposição)
        # O intervalo é o início da próxima nota menos o fim da nota atual
        gap = next_note.start - current_merged_note.end
        is_close_gap = (gap <= max_gap)

        if is_same_pitch and is_close_gap:
            # Fundir: estende o tempo de término da nota atual
            # Usamos max() caso as notas se sobreponham
            current_merged_note.end = max(current_merged_note.end, next_note.end)
            # Opcional: ajustar a velocidade (ex: pegar a mais alta)
            current_merged_note.velocity = max(current_merged_note.velocity, next_note.velocity)
        else:
            # Não fundir: finaliza a nota atual
            merged_notes.append(current_merged_note)
            # A próxima nota se torna a nova base para fusão
            current_merged_note = next_note

    # Adiciona a última nota processada
    merged_notes.append(current_merged_note)

    return merged_notes


# --- MODIFICADO ---
def generate_midi_from_audio(stem_path: str, output_dir: str) -> str:
    """
    Gera um arquivo MIDI normalizado a partir de um stem de áudio.
    Esta versão funde notas rápidas repetidas.
    Retorna o caminho para o arquivo MIDI salvo.
    """
    midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
    midi_output_path = os.path.join(output_dir, midi_file_name)

    print(f"[DEBUG] Gerando MIDI para: {stem_path}")
    try:
        model_output, midi_data, note_events = predict(stem_path, ICASSP_2022_MODEL_PATH)

        # Converte para PrettyMIDI
        midi_buffer = io.BytesIO()
        midi_data.write(midi_buffer)
        midi_buffer.seek(0)
        pm = pretty_midi.PrettyMIDI(midi_buffer)

        # Constantes de normalização
        uniform_velocity = 80
        uniform_instrument = 0  # Acoustic Grand Piano

        for instrument in pm.instruments:
            # --- NOVO: Funde notas repetidas ---
            # Substitui a lista de notas do instrumento pela nova lista processada
            if instrument.notes:
                print(f"[DEBUG] Fundindo {len(instrument.notes)} notas para {os.path.basename(stem_path)}...")
                instrument.notes = merge_repeated_notes(instrument.notes, MERGE_NOTE_GAP_SECONDS)
                print(f"[DEBUG] Notas após fusão: {len(instrument.notes)}")
            # --- FIM NOVO ---

            # Lógica de normalização original (agora aplicada às notas já fundidas)
            instrument.program = uniform_instrument
            for note in instrument.notes:
                note.velocity = uniform_velocity

        pm.write(midi_output_path)
        print(f"[DEBUG] MIDI fundido e salvo em: {midi_output_path}")
        return midi_output_path

    except Exception as e:
        print(f"[WARN] Não foi possível gerar MIDI para {stem_path}: {e}")
        return None


def create_zip_with_midi(result_files: dict) -> io.BytesIO:
    """
    Dado um dict de arquivos de resultado do MusicAI, gera arquivos MIDI,
    zipa todos os arquivos (stems + MIDI) e retorna um buffer BytesIO pronto para download.
    """
    with tempfile.TemporaryDirectory() as output_dir:
        # Download files locally
        print("[INFO] Baixando arquivos de resultado do job...")
        local_files = music_ai.download_job_results(result_files, output_dir)
        print(f"[INFO] Baixado: {local_files}")

        # Generate MIDI files
        print("[INFO] Gerando arquivos MIDI...")
        for stem_path in local_files.values():
            generate_midi_from_audio(stem_path, output_dir) # Esta função agora funde as notas

        # Create in-memory ZIP
        print("[INFO] Zipando todos os arquivos (stems + MIDI)...")
        memory_zip = io.BytesIO()
        with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_name in os.listdir(output_dir):
                full_path = os.path.join(output_dir, file_name)
                zipf.write(full_path, arcname=file_name)
                print(f"[DEBUG] Adicionado ao ZIP: {file_name}")
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

        print("[INFO] Enviando arquivo para MusicAI...")
        song_url = music_ai.upload_file(input_path)

        print("[INFO] Criando job de separação...")
        job = music_ai.add_job("All stems", "teste-pedro", {"inputUrl": song_url})
        job_id = job["id"]

        print(f"[INFO] Aguardando job {job_id} completar...")
        job_result = music_ai.wait_for_job_completion(job_id)

        if job_result["status"] != "SUCCEEDED":
            return jsonify({"error": "MusicAI job failed", "details": job_result}), 500

        print("[INFO] Criando ZIP com stems e MIDI...")
        memory_zip = create_zip_with_midi(job_result) # Esta função agora chama a lógica de fusão

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
        print(f"[INFO] Buscando resultados do job {job_id}...")
        job_result = music_ai.get_job(job_id)

        if job_result["status"] != "SUCCEEDED":
            return jsonify({
                "error": f"Job {job_id} não completou com sucesso",
                "status": job_result["status"]
            }), 400

        print("[INFO] Baixando resultados do job e criando ZIP...")
        memory_zip = create_zip_with_midi(job_result) # Esta função agora chama a lógica de fusão

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