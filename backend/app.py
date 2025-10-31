# File: backend/app.py

import os
import json
import base64
import google.generativeai as genai
from flask import Flask, send_from_directory, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from config import Config

# --- App & DB Initialization ---
db = SQLAlchemy()

# Function to create the Flask app
def create_app(config_class=Config):
    # We tell Flask that the 'frontend' folder is in the parent directory
    app = Flask(__name__, static_folder='../frontend', static_url_path='')
    app.config.from_object(config_class)

    # Initialize Database
    db.init_app(app)

    # --- Google API Client Setup ---
    try:
        # Set credentials path
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = app.config['GCP_KEY_JSON_PATH']
        
        # Configure Gemini
        genai.configure(api_key=app.config['GEMINI_API_KEY'])
        gemini_model = genai.GenerativeModel('gemini-1.5-pro-latest')

        # Import Google Cloud clients
        from google.cloud import translate_v2 as translate
        from google.cloud import texttospeech
        from google.cloud import speech

        # Initialize clients
        translate_client = translate.Client()
        tts_client = texttospeech.TextToSpeechClient()
        stt_client = speech.SpeechClient()

    except Exception as e:
        print(f"CRITICAL ERROR: Failed to initialize Google APIs. Check gcp-key.json path and API key. {e}")
    
    # --- Database Model ---
    class Resume(db.Model):
        id = db.Column(db.Integer, primary_key=True)
        profession = db.Column(db.String(100), nullable=False)
        generated_content = db.Column(db.Text, nullable=False) # The final Markdown resume
        input_data = db.Column(db.Text, nullable=True) # The JSON data from the user

    # --- Create Database Tables ---
    with app.app_context():
        # Ensure the 'instance' directory exists for the SQLite DB
        instance_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance')
        os.makedirs(instance_path, exist_ok=True)
        db.create_all()

    # === 1. FRONTEND SERVING ROUTES ===
    # These routes serve your HTML/CSS/JS files from the 'frontend' folder

    @app.route('/')
    def serve_index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.route('/dashboard.html')
    def serve_dashboard():
        return send_from_directory(app.static_folder, 'dashboard.html')
    
    # Add routes for your other HTML files
    @app.route('/forgot-password.html')
    def serve_forgot_password():
        return send_from_directory(app.static_folder, 'forgot-password.html')

    @app.route('/offline-resume.html')
    def serve_offline_resume():
        return send_from_directory(app.static_folder, 'offline-resume.html')

    @app.route('/online-resume.html')
    def serve_online_resume():
        return send_from_directory(app.static_folder, 'online-resume.html')

    # This route serves static files (e.g., /assets/image.png, /questions/general.json)
    @app.route('/<path:filename>')
    def serve_static(filename):
        return send_from_directory(app.static_folder, filename)

    # === 2. BACKEND API ROUTES ===
    # These are the endpoints your JavaScript will call

    # --- API 1: Get Translations (Your code fetches this) ---
    @app.route('/backend/api/translations/<string:lang_code>')
    def get_translation(lang_code):
        translations_dir = os.path.join(app.root_path, '../frontend/translations')
        file_path = os.path.join(translations_dir, f"{lang_code}.json")
        if not os.path.exists(file_path):
            file_path = os.path.join(translations_dir, "en.json") # Fallback
        
        return send_from_directory(translations_dir, os.path.basename(file_path))

    # --- API 2: Get Questions (Your code fetches this) ---
    @app.route('/backend/api/questions/<string:profession_key>')
    def get_questions(profession_key):
        questions_dir = os.path.join(app.root_path, '../frontend/questions')
        file_path = os.path.join(questions_dir, f"{profession_key}.json")
        if not os.path.exists(file_path):
            file_path = os.path.join(questions_dir, "general.json") # Fallback
        
        return send_from_directory(questions_dir, os.path.basename(file_path))

    # --- API 3: Generate Resume (Gemini API) ---
    @app.route('/backend/api/generate-resume', methods=['POST'])
    def generate_resume():
        data = request.json
        lang_code = request.headers.get('X-Language-Code', 'en')

        # Convert the JSON data into a clean text block for the AI
        user_data_text = "\n".join(f"- {key.replace('_', ' ').capitalize()}: {value}" for key, value in data.items())

        # Construct a detailed prompt for Gemini
        prompt = f"""
        You are an expert resume writer for blue-collar professionals.
        A user has provided this info in {lang_code}:

        {user_data_text}

        Your task:
        1.  Create a professional, ATS-friendly resume.
        2.  The resume MUST be in the user's language ({lang_code}).
        3.  Format the output as clean Markdown.
        4.  Start with a strong "Professional Summary" (2-3 sentences).
        5.  Emphasize "Skills" and "Experience" over "Education".
        6.  Make it look clean, professional, and ready to be used.
        """

        try:
            response = gemini_model.generate_content(prompt)
            generated_text = response.text

            # Save the new resume to the database
            new_resume = Resume(
                profession=data.get('profession', 'Unknown'),
                generated_content=generated_text,
                input_data=json.dumps(data)
            )
            db.session.add(new_resume)
            db.session.commit()

            return jsonify({"success": True, "resume_id": new_resume.id})

        except Exception as e:
            print(f"Error during resume generation: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # --- API 4: Get a Specific Resume (For dashboard) ---
    @app.route('/backend/api/resume/<int:resume_id>', methods=['GET'])
    def get_resume(resume_id):
        resume = db.session.get(Resume, resume_id)
        if not resume:
            return jsonify({"error": "Resume not found"}), 404
        
        return jsonify({
            "id": resume.id,
            "profession": resume.profession,
            "content": resume.generated_content,
            "input_data": json.loads(resume.input_data)
        })

    # --- API 5: Text-to-Speech (GCP TTS) ---
    @app.route('/backend/api/tts', methods=['POST'])
    def text_to_speech():
        data = request.json
        text_to_speak = data.get('text')
        lang_code = data.get('lang_code', 'en')

        # Map simple codes (e.g., 'hi') to GCP codes (e.g., 'hi-IN')
        lang_map = {'en': 'en-US', 'hi': 'hi-IN', 'bn': 'bn-IN', 'te': 'te-IN', 'mr': 'mr-IN', 'ta': 'ta-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN', 'pa': 'pa-IN', 'ur': 'ur-IN', 'or': 'or-IN', 'as': 'as-IN', 'ne': 'ne-NP', 'sd': 'sd-IN', 'kok': 'kok-IN'}
        gcp_lang_code = lang_map.get(lang_code, f'{lang_code}-{lang_code.upper()}')

        synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)
        voice = texttospeech.VoiceSelectionParams(
            language_code=gcp_lang_code,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)

        try:
            response = tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            return jsonify({
                "success": True,
                "audio_content": base64.b64encode(response.audio_content).decode('utf-8')
            })
        except Exception as e:
            print(f"Error in TTS (Lang: {gcp_lang_code}): {e}")
            # Try fallback to English
            try:
                voice.language_code = 'en-US'
                response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
                return jsonify({
                    "success": True,
                    "audio_content": base64.b64encode(response.audio_content).decode('utf-8')
                })
            except Exception as fe:
                return jsonify({"success": False, "error": str(fe)}), 500

    # --- API 6: Speech-to-Text (GCP STT) ---
    @app.route('/backend/api/stt', methods=['POST'])
    def speech_to_text():
        if 'audio' not in request.files:
            return jsonify({"success": False, "error": "No audio file"}), 400
        
        audio_file = request.files['audio']
        lang_code = request.form.get('lang_code', 'en')
        
        # Map simple codes to GCP codes
        lang_map = {'en': 'en-US', 'hi': 'hi-IN', 'bn': 'bn-IN', 'te': 'te-IN', 'mr': 'mr-IN', 'ta': 'ta-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN', 'pa': 'pa-IN', 'ur': 'ur-IN', 'or': 'or-IN', 'as': 'as-IN', 'ne': 'ne-NP', 'sd': 'sd-IN', 'kok': 'kok-IN'}
        gcp_lang_code = lang_map.get(lang_code, f'{lang_code}-{lang_code.upper()}')

        audio_content = audio_file.read()
        
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            # encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS, 
            # sample_rate_hertz=48000,
            language_code=gcp_lang_code,
            enable_automatic_punctuation=True
        )

        try:
            response = stt_client.recognize(config=config, audio=audio)
            
            if response.results and response.results[0].alternatives:
                transcript = response.results[0].alternatives[0].transcript
                return jsonify({"success": True, "transcript": transcript})
            else:
                return jsonify({"success": False, "error": "Could not recognize speech"})

        except Exception as e:
            print(f"STT Error (Lang: {gcp_lang_code}): {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    return app

# --- Run the App ---
if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)