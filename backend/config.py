# File: backend/config.py

import os
from dotenv import load_dotenv

# Path to the .env file in the parent directory
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(base_dir, '.env'))

class Config:
    # --- General Flask Config ---
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-secret-key-fallback'

    # --- Database Config (SQLite) ---
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'database.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- API Keys ---
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    # The gcp-key.json path is relative to the app.py file
    GCP_KEY_JSON_PATH = os.environ.get('GCP_KEY_JSON_PATH')

    if not GEMINI_API_KEY:
        raise ValueError("No GEMINI_API_KEY set in .env file")
    if not GCP_KEY_JSON_PATH:
        raise ValueError("No GCP_KEY_JSON_PATH set in .env file")