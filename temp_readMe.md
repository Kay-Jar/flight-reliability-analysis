git clone https://github.com/cs411-alawini/sp26-cs411-team028-blue.git
cd sp26-cs411-team028-blue

docker compose up -d

docker ps

cd sp26-cs411-team028-blue\backend
python -m uvicorn app.main:app --reload --port 8011

cd sp26-cs411-team028-blue\frontend
npm.cmd install
npm.cmd start


http://localhost:3000
