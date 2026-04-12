Run on all platforms using Docker:
git clone https://github.com/cs411-alawini/sp26-cs411-team028-blue.git
cd sp26-cs411-team028-blue

Start database:
docker compose up -d

Load data (ORDER MATTERS!!):
You must load dimension tables BEFORE fact tables.
Loading facts first will result in data loss due to cascading deletes. (learned that the hard way)

python db/loaders/load_dimensions.py
python db/loaders/load_facts.py

Start backend:
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8011

Start frontend from a new terminal:
cd frontend
npm install
npm start

Open in browser:
http://localhost:3000
