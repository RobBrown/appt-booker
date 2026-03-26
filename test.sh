while true; do

curl -X POST http://localhost:3000/api/cron/quinn-poll \
    -H "Authorization: Bearer $(doppler secrets get CRON_SECRET --plain)"

  sleep 300
done
