git clone https://github.com/cs411-alawini/sp26-cs411-team028-blue.git
^ messing with oauth just download zip to avoid it.

cd sp26-cs411-team028-blue

docker compose up -d

docker ps

python db\loaders\load_facts.py
python db\loaders\load_dimensions.py


cd sp26-cs411-team028-blue\backend
pip install -r requirements.txt


python -m uvicorn app.main:app --reload --port 8011


NEW WINDOW

cd sp26-cs411-team028-blue\frontend

MAKE SURE Node.js is up to date!!!

npm.cmd install

npm.cmd start



http://localhost:3000
