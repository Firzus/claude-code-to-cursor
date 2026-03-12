# ccproxy

Proxy local qui route les requêtes LLM à travers l'authentification OAuth de Claude Code. Accepte les formats Anthropic (`/v1/messages`) et OpenAI (`/v1/chat/completions`), ce qui permet d'utiliser Claude dans Cursor IDE ou tout autre client compatible OpenAI.

## Prérequis

- [Bun](https://bun.sh/) (runtime JavaScript/TypeScript)

```bash
# Installation de Bun (Windows via PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Ou via npm
npm install -g bun
```

## Installation

```bash
git clone <url-du-repo>
cd ccproxy
bun install
```

## Configuration

Copiez le fichier d'exemple et ajustez selon vos besoins :

```bash
cp .env.example .env
```

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port du serveur | `8082` |
| `ALLOWED_IPS` | IPs autorisées (séparées par des virgules), ou `"disabled"` pour tout autoriser | `52.44.113.131,184.73.225.134` |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | Instruction supplémentaire ajoutée au system prompt | *(proxy headless par défaut)* |

## Démarrage

```bash
# Développement (hot reload)
bun run dev

# Production
bun run start
```

Le serveur démarre sur `http://localhost:8082` par défaut.

## Authentification

Au premier lancement, le proxy n'a pas de token OAuth. Pour s'authentifier :

1. Ouvrez **http://localhost:8082/login** dans votre navigateur
2. Suivez le flux OAuth (connexion via votre compte Claude)
3. Les credentials sont sauvegardés dans `~/.ccproxy/auth.json` et rafraîchis automatiquement

Vous pouvez vérifier l'état de l'authentification via le endpoint health :

```bash
curl http://localhost:8082/health
```

## Utilisation avec Cursor

Dans les paramètres de Cursor, configurez un provider OpenAI-compatible :

- **API Base URL** : `http://localhost:8082`
- **API Key** : n'importe quelle valeur (le proxy utilise son propre token OAuth)

## Endpoints

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/health` | État du serveur et de l'authentification |
| `GET` | `/login` | Lancer le flux OAuth |
| `POST` | `/v1/messages` | Proxy Anthropic natif |
| `POST` | `/v1/chat/completions` | Endpoint compatible OpenAI |
| `GET` | `/v1/models` | Liste des modèles Claude disponibles |
| `GET` | `/analytics` | Tableau de bord analytics |
| `GET` | `/analytics/requests` | Détail des requêtes |
| `POST` | `/analytics/reset` | Réinitialiser les analytics |

## Vérification TypeScript

```bash
bun run typecheck
```
