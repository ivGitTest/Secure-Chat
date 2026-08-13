# Replace /home/user/messenger with your actual repo path
REPO=/root/docker_containers/messenger

sudo tee /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh > /dev/null <<EOF
#!/bin/sh
docker compose -f $REPO/deploy/docker-compose.yml stop nginx
EOF
sudo tee /etc/letsencrypt/renewal-hooks/post/start-nginx.sh > /dev/null <<EOF
#!/bin/sh
docker compose -f $REPO/deploy/docker-compose.yml start nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh \
              /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
