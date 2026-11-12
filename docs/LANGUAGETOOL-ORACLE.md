# Serveur LanguageTool gratuit sur Oracle Cloud

Ce guide installe un serveur [LanguageTool](https://languagetool.org) à vous, gratuit, pour la correction des phrases de Lexora (*Réutiliser mes expressions*, étapes 2 et 3). Compter environ 45 minutes la première fois.

Ce que vous obtenez :

- une machine Oracle Cloud **« Always Free »** (processeur ARM, 6 Go de mémoire), gratuite sans limite de durée ;
- LanguageTool qui tourne en permanence et redémarre tout seul ;
- une adresse fixe gratuite (`monlexora.duckdns.org`) en **HTTPS**, protégée par **identifiant et mot de passe** : seule la fonction Supabase de Lexora s'en sert.

Les écrans d'Oracle changent de temps en temps : les noms de menus ci-dessous peuvent légèrement différer. Les conditions de l'offre gratuite aussi : vérifiez-les à l'inscription.

## 1. Créer le compte Oracle Cloud

1. Aller sur <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Remplir le formulaire. Une **carte bancaire** est demandée pour vérifier l'identité ; rien n'est prélevé tant qu'on reste dans l'offre gratuite.
3. **Home region** : choisir une région proche, par exemple **France Central (Paris)**, **France South (Marseille)** ou **Germany Central (Frankfurt)**. Elle ne peut **plus être changée** ensuite, et les machines gratuites ne se créent que dans cette région.
4. Attendre l'e-mail de confirmation (de quelques minutes à quelques heures), puis se connecter à <https://cloud.oracle.com>.

## 2. Réserver l'adresse DuckDNS (gratuite)

1. Aller sur <https://www.duckdns.org> et se connecter (avec GitHub ou Google par exemple).
2. Dans **sub domain**, taper un nom (par exemple `monlexora`) → **add domain**. L'adresse sera `monlexora.duckdns.org`.
3. Noter le **token** affiché en haut de la page : le script en aura besoin. Ne pas le partager.

Pas besoin d'y saisir d'adresse IP : le script la renseigne lui-même et la tient à jour.

## 3. Créer la machine

1. Dans la console Oracle : menu **☰** → **Compute** → **Instances** → **Create instance**.
2. **Name** : `languagetool`.
3. **Image and shape** → **Edit** :
   - **Change image** → **Ubuntu** → **Canonical Ubuntu 24.04** (pas la version *Minimal*) → **Select image** ;
   - **Change shape** → **Ampere** → **VM.Standard.A1.Flex** → **1 OCPU** et **6 GB** de mémoire → **Select shape**. Le libellé « Always Free-eligible » doit apparaître.
4. **Networking** : laisser **Create new virtual cloud network** et **Create new public subnet** ; vérifier que **Assign a public IPv4 address** est coché.
5. **Add SSH keys** : **Generate a key pair for me** → **Save private key** (fichier `ssh-key-….key`). **Gardez ce fichier** : c'est la seule façon de se connecter à la machine.
6. **Create**. Au bout d'une à deux minutes, l'état passe à **Running**. Noter l'**adresse IP publique** (*Public IP address*).

**« Out of capacity for shape VM.Standard.A1.Flex »** : la région n'a momentanément plus de machines ARM gratuites. Réessayer plus tard (souvent quelques heures suffisent), ou changer de *Availability domain* dans le formulaire s'il y en a plusieurs.

## 4. Ouvrir les ports 80 et 443

Le HTTPS a besoin des ports 80 (obtention du certificat) et 443.

1. Dans la page de l'instance : **Primary VNIC** → cliquer sur le **Subnet** → **Security Lists** → **Default Security List for …**.
2. **Add Ingress Rules** :
   - **Source CIDR** : `0.0.0.0/0` ; **IP Protocol** : TCP ; **Destination Port Range** : `80` → **Add Ingress Rules** ;
   - recommencer avec le port `443`.

Le pare-feu interne de la machine est ouvert par le script.

## 5. Se connecter à la machine

**Windows** (PowerShell) :

```powershell
# Limiter les droits du fichier de clé (sinon ssh le refuse)
icacls "$env:USERPROFILE\Downloads\ssh-key-XXXX.key" /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i "$env:USERPROFILE\Downloads\ssh-key-XXXX.key" ubuntu@ADRESSE_IP
```

**Mac** (Terminal) :

```sh
chmod 600 ~/Downloads/ssh-key-XXXX.key
ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@ADRESSE_IP
```

Remplacer `ssh-key-XXXX.key` par le nom du fichier téléchargé et `ADRESSE_IP` par l'adresse de l'étape 3. Répondre `yes` à la première connexion.

## 6. Lancer le script d'installation

Sur la machine (dans la fenêtre SSH) :

1. Créer un mot de passe solide pour l'accès au serveur, et le noter :

   ```sh
   openssl rand -base64 24 | tr -d '/+='
   ```

2. Copier le script : sur GitHub, ouvrir [`scripts/languagetool-server.sh`](../scripts/languagetool-server.sh) → bouton **Raw** → tout sélectionner et copier. Puis :

   ```sh
   nano languagetool-server.sh
   ```

   coller (clic droit dans PowerShell, ou Cmd+V sur Mac), puis **Ctrl+O**, **Entrée**, **Ctrl+X**.

3. Lancer :

   ```sh
   sudo bash languagetool-server.sh
   ```

   Le script demande le sous-domaine DuckDNS (`monlexora`), le token DuckDNS, un identifiant (par exemple `lexora`) et le mot de passe créé ci-dessus. Il installe Java 17, LanguageTool (dernière version stable), Caddy (HTTPS automatique et mot de passe), met à jour DuckDNS et ouvre le pare-feu. Compter 5 minutes.

4. À la fin, il affiche :

   ```
   HTTPS et mot de passe : OK (https://monlexora.duckdns.org).

   == Secrets à ajouter dans Supabase (Edge Functions → Secrets) ==
   LANGUAGETOOL_URL  = https://monlexora.duckdns.org
   LANGUAGETOOL_AUTH = Basic …
   ```

   Copier ces deux valeurs.

**« HTTPS pas encore joignable »** : en général, les ports 80 et 443 de l'étape 4 ne sont pas ouverts. Les ajouter, puis relancer `sudo bash languagetool-server.sh` (les réponses précédentes sont proposées par défaut : il suffit d'appuyer sur Entrée).

Vérification depuis votre ordinateur : <https://monlexora.duckdns.org/v2/languages> demande l'identifiant et le mot de passe, puis affiche la liste des langues.

## 7. Brancher Lexora

1. Dans Supabase : **Edge Functions** → **Secrets** → ajouter `LANGUAGETOOL_URL` et `LANGUAGETOOL_AUTH` (valeurs affichées par le script).
2. Déployer la fonction `grammar` si ce n'est pas fait : voir [SUPABASE.md](SUPABASE.md), section « Correction des phrases (LanguageTool) ».
3. Dans Lexora : **Paramètres** → **Prononciation & raccourcis** → **Correction des phrases (LanguageTool)** → **Tester** : « Serveur LanguageTool joignable ».

## Entretien

- **Mettre LanguageTool à jour** (quelques fois par an) : se reconnecter et relancer `sudo bash languagetool-server.sh` (Entrée à chaque question).
- **État des services** : `sudo systemctl status languagetool caddy` ; journaux : `journalctl -u languagetool -n 50` et `journalctl -u caddy -n 50`.
- **Mises à jour de sécurité d'Ubuntu** : appliquées automatiquement (paquet `unattended-upgrades`, actif par défaut) ; pour tout mettre à jour à la main : `sudo apt update && sudo apt upgrade`.
- **Machine inactive** : sur un compte resté gratuit, Oracle peut récupérer une machine *Always Free* jugée inactive pendant plusieurs jours (processeur, réseau et mémoire très peu utilisés). Pour l'éviter, passer le compte en **Pay As You Go** (*Billing & Cost Management* → *Upgrade and Manage Payment*) : l'usage reste gratuit tant qu'il ne dépasse pas les limites *Always Free*. Ajouter alors un **budget** d'1 € avec alerte par e-mail (*Billing & Cost Management* → *Budgets*) pour être prévenu de tout coût.
- **Ce que reçoit le serveur** : seulement les phrases à vérifier, envoyées par la fonction Supabase. LanguageTool ne les garde pas ; Caddy ne journalise pas le contenu des requêtes.
