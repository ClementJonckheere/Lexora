#!/usr/bin/env bash
# Serveur LanguageTool pour Lexora (correction des phrases, fonction Supabase « grammar »), sur une machine Ubuntu
# (22.04 ou 24.04, ARM ou x86), par exemple Oracle Cloud « Always Free ». Guide : docs/LANGUAGETOOL-ORACLE.md.
#
# Installe et démarre :
#   - LanguageTool (Java 17), en service système, écoutant seulement en local (port 8081) ;
#   - Caddy devant lui : HTTPS automatique (Let's Encrypt) et accès protégé par identifiant et mot de passe ;
#   - la mise à jour de l'adresse DuckDNS toutes les 5 minutes ;
#   - l'ouverture des ports 80 et 443 dans le pare-feu de la machine.
# Relancer le script met LanguageTool à jour (dernière version stable) et réapplique la configuration.
#
# Usage : sudo bash languagetool-server.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo : sudo bash $0" >&2
  exit 1
fi

CONF=/etc/lexora-languagetool.conf
# Réponses d'une installation précédente : pas besoin de tout ressaisir.
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

ask() {
  local var=$1 prompt=$2 secret=${3:-}
  local current=${!var:-}
  local answer
  if [ -n "$current" ]; then prompt="$prompt [Entrée : garder la valeur actuelle]"; fi
  if [ -n "$secret" ]; then read -r -s -p "$prompt : " answer; echo; else read -r -p "$prompt : " answer; fi
  answer=${answer:-$current}
  if [ -z "$answer" ]; then echo "Valeur obligatoire." >&2; exit 1; fi
  printf -v "$var" '%s' "$answer"
}

echo "== Configuration =="
ask DUCK_SUBDOMAIN "Sous-domaine DuckDNS (sans .duckdns.org, ex. monlexora)"
DUCK_SUBDOMAIN=${DUCK_SUBDOMAIN%.duckdns.org}
ask DUCK_TOKEN "Jeton DuckDNS (token, en haut de la page duckdns.org)" secret
ask LT_USER "Identifiant d'accès au serveur (ex. lexora)"
ask LT_PASSWORD "Mot de passe d'accès au serveur (long et aléatoire)" secret
DOMAIN="$DUCK_SUBDOMAIN.duckdns.org"
for v in "$DUCK_SUBDOMAIN" "$DUCK_TOKEN" "$LT_USER" "$LT_PASSWORD"; do
  case $v in
    *[[:space:]\'\"\\\$\`:]*) echo "Ni espace, ni guillemet, ni \\, \$, \`, : dans les valeurs saisies." >&2; exit 1 ;;
  esac
done
if [ ${#LT_PASSWORD} -lt 16 ]; then echo "Mot de passe trop court : 16 caractères au moins." >&2; exit 1; fi

umask 077
cat > "$CONF" <<EOF
DUCK_SUBDOMAIN='$DUCK_SUBDOMAIN'
DUCK_TOKEN='$DUCK_TOKEN'
LT_USER='$LT_USER'
LT_PASSWORD='$LT_PASSWORD'
EOF
umask 022

echo "== Paquets (Java 17, outils) =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q openjdk-17-jre-headless unzip curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

echo "== Adresse DuckDNS =="
cat > /usr/local/bin/duckdns-update <<EOF
#!/bin/sh
curl -fsS "https://www.duckdns.org/update?domains=$DUCK_SUBDOMAIN&token=$DUCK_TOKEN&ip=" -o /var/log/duckdns.log
EOF
chmod 700 /usr/local/bin/duckdns-update
/usr/local/bin/duckdns-update
if [ "$(cat /var/log/duckdns.log)" != "OK" ]; then
  echo "DuckDNS a refusé la mise à jour : vérifier le sous-domaine et le jeton." >&2
  exit 1
fi
echo "*/5 * * * * root /usr/local/bin/duckdns-update" > /etc/cron.d/duckdns
echo "$DOMAIN pointe vers cette machine."

echo "== LanguageTool (dernière version stable) =="
id languagetool >/dev/null 2>&1 || useradd --system --home /opt/languagetool --shell /usr/sbin/nologin languagetool
tmp=$(mktemp -d)
curl -fsSL https://languagetool.org/download/LanguageTool-stable.zip -o "$tmp/lt.zip"
unzip -q "$tmp/lt.zip" -d "$tmp"
dir=$(find "$tmp" -maxdepth 1 -type d -name 'LanguageTool-*' | head -1)
[ -n "$dir" ] || { echo "Archive LanguageTool inattendue." >&2; exit 1; }
rm -rf /opt/languagetool.new
mv "$dir" /opt/languagetool.new
rm -rf /opt/languagetool
mv /opt/languagetool.new /opt/languagetool
chown -R languagetool:languagetool /opt/languagetool
rm -rf "$tmp"

cat > /etc/systemd/system/languagetool.service <<'EOF'
[Unit]
Description=LanguageTool (Lexora)
After=network.target

[Service]
User=languagetool
WorkingDirectory=/opt/languagetool
# Sans --public, le serveur n'écoute qu'en local : seul Caddy (HTTPS + mot de passe) y accède.
ExecStart=/usr/bin/java -Xms256m -Xmx1500m -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now languagetool
systemctl restart languagetool

echo "== Caddy (HTTPS et mot de passe) =="
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
HASH=$(caddy hash-password --plaintext "$LT_PASSWORD")
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	basic_auth {
		$LT_USER $HASH
	}
	reverse_proxy localhost:8081
}
EOF
chmod 640 /etc/caddy/Caddyfile
chown root:caddy /etc/caddy/Caddyfile

echo "== Pare-feu de la machine (ports 80 et 443) =="
# Les images Ubuntu d'Oracle bloquent tout sauf SSH : règles ajoutées avant le rejet final, une seule fois.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    reject=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    if [ -n "$reject" ]; then
      iptables -I INPUT "$reject" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  fi
done
netfilter-persistent save >/dev/null

systemctl enable caddy >/dev/null
systemctl restart caddy

echo "== Vérification =="
for _ in $(seq 1 60); do
  curl -fsS http://localhost:8081/v2/languages >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://localhost:8081/v2/languages >/dev/null || { echo "LanguageTool ne répond pas : journalctl -u languagetool" >&2; exit 1; }
echo "LanguageTool répond en local."
ok=""
for _ in $(seq 1 30); do
  if curl -fsS -u "$LT_USER:$LT_PASSWORD" "https://$DOMAIN/v2/languages" >/dev/null 2>&1; then ok=1; break; fi
  sleep 4
done
if [ -n "$ok" ]; then
  echo "HTTPS et mot de passe : OK (https://$DOMAIN)."
else
  echo "HTTPS pas encore joignable : vérifier les ports 80 et 443 dans la liste de sécurité Oracle (guide, étape 4), puis : journalctl -u caddy" >&2
fi

AUTH="Basic $(printf '%s:%s' "$LT_USER" "$LT_PASSWORD" | base64 -w0)"
cat <<EOF

== Secrets à ajouter dans Supabase (Edge Functions → Secrets) ==
LANGUAGETOOL_URL  = https://$DOMAIN
LANGUAGETOOL_AUTH = $AUTH
EOF
