import os
import zipfile
import io
import tempfile
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
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
CORS(app)

MUSICAI_API_KEY = os.getenv("MUSICAI_API_KEY")
MUSICAI_WORKFLOW_TITLE = os.getenv("MUSICAI_WORKFLOW_TITLE")
MUSICAI_WORKFLOW_SLUG = os.getenv("MUSICAI_WORKFLOW_SLUG")
music_ai = MusicAiClient(api_key=MUSICAI_API_KEY)

# ------------------------
# Utility functions
# ------------------------

def filter_piano_stem(result_files: dict) -> dict:
    """
    Tenta identificar o arquivo que contém o piano.
    Prioridade: 'piano' > 'other' > 'accompaniment'
    Se não achar, retorna o primeiro disponível.
    """
    # Normaliza chaves para minúsculas para busca
    keys = {k.lower(): k for k in result_files.keys()}
    
    if 'piano' in keys:
        target_key = keys['piano']
        print(f"[INFO] Stem de Piano explícito encontrado: {target_key}")
        return {target_key: result_files[target_key]}
    
    if 'other' in keys:
        target_key = keys['other']
        print(f"[INFO] Stem de Piano provável encontrado em 'other': {target_key}")
        return {target_key: result_files[target_key]}
        
    print("[WARN] Stem de piano específico não encontrado. Processando todos.")
    return result_files

def generate_midi_from_audio(stem_path: str, output_dir: str) -> str:
    """
    Gera MIDI otimizado para PIANO CLÁSSICO.
    """
    midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
    midi_output_path = os.path.join(output_dir, midi_file_name)

    print(f"[DEBUG] Gerando MIDI para: {stem_path}")
    try:
        # PARÂMETROS OTIMIZADOS PARA PIANO:
        # onset_threshold=0.6: Mais rigoroso com o início das notas para evitar "fantasmas"
        # frame_threshold=0.3: Permite sustentação natural
        # minimum_note_length=50: (ms) Ignora ruídos muito curtos, mas permite notas rápidas (staccato)
        # minimum_frequency=27.5: Nota A0 (limite grave do piano)
        # maximum_frequency=4186.0: Nota C8 (limite agudo do piano)
        model_output, midi_data, note_events = predict(
            stem_path, 
            ICASSP_2022_MODEL_PATH,
            onset_threshold=0.6, 
            frame_threshold=0.3,
            minimum_note_length=50,
            minimum_frequency=27.5,
            maximum_frequency=4186.0
        )

        # PÓS-PROCESSAMENTO PARA PIANO
        # 1. Definir instrumento correto
        piano_program = pretty_midi.instrument_name_to_program('Acoustic Grand Piano')
        
        # Como o basic_pitch pode gerar múltiplos instrumentos "estimados", 
        # vamos consolidar ou forçar todos para Piano.
        for instrument in midi_data.instruments:
            instrument.program = piano_program
            instrument.is_drum = False
            
            # 2. REMOVER PITCH BENDS (Crítico para Piano)
            # Pianos não fazem bend. Bends geram som de "piano desafinado".
            instrument.pitch_bends = []

            # 3. MANTER VELOCITY (Dinâmica)
            # Removemos sua linha que forçava velocity=80. 
            # O `predict` já extrai a força da nota (velocity), o que é vital para música clássica.

        midi_data.write(midi_output_path)
        print(f"[DEBUG] MIDI salvo em: {midi_output_path}")
        return midi_output_path

    except Exception as e:
        print(f"[WARN] Erro ao gerar MIDI para {stem_path}: {e}")
        return None


def create_zip_with_midi(result_files: dict) -> io.BytesIO:
    with tempfile.TemporaryDirectory() as output_dir:
        
        # 1. Filtra apenas o piano para economizar tempo e focar na qualidade
        piano_files_map = filter_piano_stem(result_files)
        
        print("[INFO] Baixando stem de piano...")
        local_files = music_ai.download_job_results(piano_files_map, output_dir)
        
        print("[INFO] Gerando MIDI de alta precisão...")
        generated_midis = []
        for stem_path in local_files.values():
            midi_path = generate_midi_from_audio(stem_path, output_dir)
            if midi_path:
                generated_midis.append(midi_path)

        # Create ZIP
        print("[INFO] Zipando resultados...")
        memory_zip = io.BytesIO()
        with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Adiciona os arquivos de áudio baixados
            for file_name in os.listdir(output_dir):
                full_path = os.path.join(output_dir, file_name)
                # Opcional: Se quiser entregar APENAS o MIDI, filtre aqui.
                # Atualmente inclui o áudio do piano + o MIDI.
                zipf.write(full_path, arcname=file_name)
                
        memory_zip.seek(0)
        return memory_zip

# ------------------------
# Routes (Mantidas iguais, lógica interna alterada)
# ------------------------

@app.route("/workflows", methods=["GET"])
def list_workflows():
    try:
        workflows = music_ai.list_workflows()
        if isinstance(workflows, dict) and "data" in workflows:
            workflows = workflows["data"]
        formatted = [{"slug": w.get("slug"), "name": w.get("name")} for w in workflows]
        return jsonify({"workflows": formatted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/download/<job_id>", methods=["GET"])
def download_existing_job(job_id):
    """
    Baixa e processa um job existente do MusicAI pelo ID.
    Aplica a lógica de separação de piano clássico (sem pitch bends, alta precisão).
    """
    try:
        print(f"[INFO] Buscando status do job {job_id}...")
        job_result = music_ai.get_job(job_id)

        # Verifica se o job já terminou
        if job_result.get("status") != "SUCCEEDED":
            return jsonify({
                "error": f"Job {job_id} não está concluído ou falhou.",
                "status": job_result.get("status"),
                "details": job_result
            }), 400

        print("[INFO] Job válido. Iniciando processamento de MIDI para Piano...")
        
        # A função create_zip_with_midi agora já contém:
        # 1. O filtro inteligente para pegar apenas o stem de piano
        # 2. A geração de MIDI com onset_threshold=0.6 e sem pitch bends
        memory_zip = create_zip_with_midi(job_result)

        return send_file(
            memory_zip,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"piano_classic_midi_{job_id}.zip"
        )

    except Exception as e:
        print(f"[ERROR] Erro no download do job {job_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/separate", methods=["GET"])
def separate_music():
    try:
        input_path = "./odeon.m4a" # Certifique-se que este arquivo existe ou receba via upload
        if not os.path.exists(input_path):
            return jsonify({"error": "Arquivo local não encontrado"}), 404

        print("[INFO] Uploading...")
        song_url = music_ai.upload_file(input_path)

        print("[INFO] Job start...")
        job = music_ai.add_job(MUSICAI_WORKFLOW_TITLE, MUSICAI_WORKFLOW_SLUG, {"inputUrl": song_url})
        job_id = job["id"]

        print(f"[INFO] Waiting job {job_id}...")
        job_result = music_ai.wait_for_job_completion(job_id)

        if job_result["status"] != "SUCCEEDED":
            return jsonify({"error": "MusicAI job failed", "details": job_result}), 500

        memory_zip = create_zip_with_midi(job_result)

        return send_file(
            memory_zip,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"piano_midi_{job_id}.zip"
        )

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500
    
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    login = data.get("login")
    senha = data.get("senha")
    return jsonify({"success": True, "error": ""})

@app.route("/cadastro", methods=["POST"])
def cadastro():
    data = request.get_json()
    login = data.get("login")
    senha = data.get("senha")
    return jsonify({"success": True, "error": ""})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)