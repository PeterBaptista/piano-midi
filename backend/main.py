import os
import zipfile
import io
import tempfile
import glob
import yt_dlp
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
from dotenv import load_dotenv

from musicai_sdk import MusicAiClient
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import pretty_midi

from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, Job 

# ------------------------
# Setup and configuration
# ------------------------
load_dotenv()
app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///music_app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv("JWT_SECRET_KEY", "chavesecreta")

db.init_app(app)
jwt = JWTManager(app)

bcrypt = Bcrypt(app)

with app.app_context():
    db.create_all()

MUSICAI_API_KEY = os.getenv("MUSICAI_API_KEY")
MUSICAI_WORKFLOW_TITLE = os.getenv("MUSICAI_WORKFLOW_TITLE")
MUSICAI_WORKFLOW_SLUG = os.getenv("MUSICAI_WORKFLOW_SLUG")
music_ai = MusicAiClient(api_key=MUSICAI_API_KEY)

# ------------------------
# Rotas de Autenticação
# ------------------------

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({"msg": "Dados incompletos"}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({"msg": "Usuário já existe"}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"msg": "Email já cadastrado"}), 400

    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')

    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_password
    )

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"msg": "Usuário criado com sucesso!"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"msg": "Dados incompletos"}), 400

    user = User.query.filter_by(username=data['username']).first()

    if user and bcrypt.check_password_hash(user.password_hash, data['password']):
        access_token = create_access_token(identity=str(user.id))
        return jsonify({
            "msg": "Login realizado com sucesso",
            "access_token": access_token,
            "user": {"username": user.username, "email": user.email}
        }), 200
    
    return jsonify({"msg": "Usuário ou senha inválidos"}), 401

@app.route('/meus-dados', methods=['GET'])
@jwt_required()
def get_user_data():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    return jsonify({
        "id": user.id,
        "username": user.username,
        "email": user.email
    }), 200

# ------------------------
# Funções Utilitárias
# ------------------------

def download_youtube_audio_bytes(url: str) -> bytes:
    """
    Baixa o áudio do YouTube e retorna os bytes brutos.
    Requer FFmpeg instalado no sistema.
    """
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        ydl_opts['outtmpl'] = os.path.join(temp_dir, '%(id)s.%(ext)s')
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            arquivos = glob.glob(os.path.join(temp_dir, "*.mp3"))
            if not arquivos:
                raise FileNotFoundError("O arquivo de áudio não foi gerado corretamente.")
                
            caminho_arquivo = arquivos[0]
            
            with open(caminho_arquivo, "rb") as f:
                audio_bytes = f.read()
                
            return audio_bytes

        except Exception as e:
            raise RuntimeError(f"Falha ao baixar áudio: {str(e)}")

def filter_piano_stem(result_files: dict) -> dict:
    keys = {k.lower(): k for k in result_files.keys()}
    
    if 'piano' in keys:
        return {keys['piano']: result_files[keys['piano']]}
    
    if 'other' in keys:
        return {keys['other']: result_files[keys['other']]}        
    return result_files

def generate_midi_from_audio(stem_path: str, output_dir: str) -> str:
    """Gera MIDI otimizado para PIANO CLÁSSICO."""
    midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
    midi_output_path = os.path.join(output_dir, midi_file_name)

    print(f"[DEBUG] Gerando MIDI para: {stem_path}")
    try:
        model_output, midi_data, note_events = predict(
            stem_path, 
            ICASSP_2022_MODEL_PATH,
            onset_threshold=0.6, 
            frame_threshold=0.3,
            minimum_note_length=50,
            minimum_frequency=27.5,
            maximum_frequency=4186.0
        )

        piano_program = pretty_midi.instrument_name_to_program('Acoustic Grand Piano')
        
        for instrument in midi_data.instruments:
            instrument.program = piano_program
            instrument.is_drum = False
            instrument.pitch_bends = []

        midi_data.write(midi_output_path)
        return midi_output_path

    except Exception as e:
        print(f"[WARN] Erro ao gerar MIDI para {stem_path}: {e}")
        return None

def create_zip_with_midi(result_files: dict) -> io.BytesIO:
    with tempfile.TemporaryDirectory() as output_dir:
        piano_files_map = filter_piano_stem(result_files)
        
        print("[INFO] Baixando stem de piano...")
        local_files = music_ai.download_job_results(piano_files_map, output_dir)
        
        print("[INFO] Gerando MIDI de alta precisão...")
        for stem_path in local_files.values():
            generate_midi_from_audio(stem_path, output_dir)

        print("[INFO] Zipando resultados...")
        memory_zip = io.BytesIO()
        with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_name in os.listdir(output_dir):
                full_path = os.path.join(output_dir, file_name)
                zipf.write(full_path, arcname=file_name)
                
        memory_zip.seek(0)
        return memory_zip

@app.route("/process-youtube", methods=["POST"])
@jwt_required()
def process_youtube():
    """
    Recebe link youtube, baixa, envia pra MusicAI e salva Job no banco.
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()
    youtube_url = data.get("url")

    if not youtube_url:
        return jsonify({"error": "URL é obrigatória"}), 400

    try:
        print(f"[INFO] Baixando do YouTube: {youtube_url}")
        audio_bytes = download_youtube_audio_bytes(youtube_url)

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_path = temp_audio.name
        
        print("[INFO] Enviando para MusicAI...")
        song_url = music_ai.upload_file(temp_path)
        os.unlink(temp_path)

        print("[INFO] Iniciando Job na MusicAI...")
        job = music_ai.add_job(MUSICAI_WORKFLOW_TITLE, MUSICAI_WORKFLOW_SLUG, {"inputUrl": song_url})
        job_id = job["id"]

        new_job = Job(
            musicai_job_id=job_id,
            youtube_url=youtube_url,
            status="PENDING",
            user_id=current_user_id
        )
        db.session.add(new_job)
        db.session.commit()

        return jsonify({
            "message": "Processamento iniciado",
            "job_id": job_id,
            "status": "PENDING"
        }), 201

    except Exception as e:
        print(f"[ERROR] {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/jobs/<job_id>", methods=["GET"])
@jwt_required()
def get_job_status_or_download(job_id):
    should_download = request.args.get('download') != 'false'

    try:
        job_result = music_ai.get_job(job_id)
        remote_status = job_result.get("status")

        local_job = Job.query.filter_by(musicai_job_id=job_id).first()
        if local_job and local_job.status != remote_status:
            local_job.status = remote_status
            db.session.commit()

        if remote_status == "SUCCEEDED":
            if not should_download:
                return jsonify({"status": "SUCCEEDED", "details": job_result})
            
            memory_zip = create_zip_with_midi(job_result)
            return send_file(
                memory_zip,
                mimetype="application/zip",
                as_attachment=True,
                download_name=f"piano_midi_{job_id}.zip"
            )
        
        elif remote_status == "FAILED":
             return jsonify({"status": "FAILED", "error": "O processamento falhou na MusicAI"}), 400
        
        else:
            return jsonify({"status": remote_status, "message": "Ainda processando..."}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/jobs/<job_id>/midi", methods=["GET"]) 
@jwt_required()
def get_job_midi(job_id):
    """
    Retorna o primeiro arquivo MIDI gerado pelo job da MusicAI como conteúdo bruto.
    Usado para importar o MIDI diretamente na UI sem precisar baixar o ZIP manualmente.
    """
    try:
        job_result = music_ai.get_job(job_id)
        remote_status = job_result.get("status")

        if remote_status != "SUCCEEDED":
            return jsonify({"error": "Job ainda não concluído"}), 400

        # Reutiliza a função que gera o ZIP com os MIDIs e stems
        memory_zip = create_zip_with_midi(job_result)

        # Abre o ZIP em memória e extrai o primeiro .mid
        with zipfile.ZipFile(memory_zip) as z:
            midi_files = [n for n in z.namelist() if n.lower().endswith('.mid')]
            if not midi_files:
                return jsonify({"error": "Nenhum arquivo MIDI encontrado nos resultados"}), 404

            first_midi_name = midi_files[0]
            midi_bytes = z.read(first_midi_name)

        return send_file(
            io.BytesIO(midi_bytes),
            mimetype='audio/midi',
            as_attachment=False,
            download_name=first_midi_name
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

@app.route("/separate", methods=["GET"])
def separate_music():
    try:
        input_path = "./odeon.m4a"
        if not os.path.exists(input_path):
            return jsonify({"error": "Arquivo local não encontrado"}), 404
        song_url = music_ai.upload_file(input_path)
        job = music_ai.add_job(MUSICAI_WORKFLOW_TITLE, MUSICAI_WORKFLOW_SLUG, {"inputUrl": song_url})
        job_id = job["id"]
        job_result = music_ai.wait_for_job_completion(job_id)
        if job_result["status"] != "SUCCEEDED":
            return jsonify({"error": "Job failed"}), 500
        memory_zip = create_zip_with_midi(job_result)
        return send_file(memory_zip, mimetype="application/zip", as_attachment=True, download_name=f"piano_{job_id}.zip")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)