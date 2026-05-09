---
name: audit-best-practices
overview: Audit du repo cctc face à 8 best-practice skills. Aucun changement de code à ce stade — diagnostic + recommandations priorisées.
todos: []
isProject: false
---


# Audit best practices — claude-code-to-cursor

> Lecture seule. Constats par skill, classés par sévérité. Aucun fix appliqué.

## Synthèse

Codebase globalement très propre : `tsc strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`, 0 `eval/innerHTML/dangerouslySetInnerHTML`, OAuth/PKCE solide (PKCE S256, `timingSafeEqual` pour le settings key, `crypto.randomUUID`), pas de `Date.now()` côté queries Convex (commentaire explicite). Les défauts sont ciblés : (1) **dead code `frontend/`**, (2) `force-dynamic` partout / pas de `cacheComponents`, (3) `pkceState` doit migrer vers Convex (drift avec [AGENTS.md](AGENTS.md)), (4) module-level Convex public exposant les tokens OAuth (déjà documenté mais améliorable), (5) deux `_helpers.ts` `as any` qui peuvent être typés proprement.

Aucun finding **Critical** côté `security-review`. Plusieurs **High** côté `next-best-practices` / `convex-quickstart`.

---

## 1. `next-best-practices`

### High
- **`force-dynamic` global est devenu un anti-pattern en Next.js 16.** 24 fichiers le déclarent ([`app/layout.tsx:14`](app/layout.tsx) jusqu'à `app/api/v1/messages/route.ts`). Avec Next 16, le défaut Route Handler est déjà dynamique, et pour les pages le défaut convient à des données live. Garder uniquement sur les pages qui le nécessitent réellement (les pages OAuth/health) et **supprimer ailleurs** — c'est le table de migration officielle (`dynamic = 'force-dynamic'` → "remove").
- **`app/layout.tsx:14` `export const dynamic = "force-dynamic"`** force toutes les sous-pages à être dynamiques et bloque toute opportunité de PPR (RSC layout est rarement la bonne place pour ça).

### Medium
- **`force-dynamic` sur `app/api/health/route.ts`** : un Route Handler avec `Date.now()` et `getRateLimitStatus()` est dynamique de fait — la directive est redondante. Idem pour les autres `route.ts`.
- **`error.tsx` à la racine `app/` n'est pas un `global-error.tsx`.** [`app/error.tsx:9`](app/error.tsx) capture seulement les erreurs sous-arbres. Pour couvrir le RootLayout (rare mais vital), ajouter `app/global-error.tsx` rendu en fallback complet.
- **Pas de `cacheComponents`** dans [`next.config.ts`](next.config.ts) → impossible d'utiliser `'use cache'` / `cacheLife` / `cacheTag`. Voir section 7.

### Low
- `experimental.optimizePackageImports` : bon usage, mais `@hookform/resolvers` et `sonner` sont déjà des paquets shaken-out par défaut. Vérifier l'effet réel via `pnpm build --analyze`.

---

## 2. `next-cache-components`

Non utilisé du tout (`grep cacheComponents|use cache` → 0 hit).

### Opportunités prioritaires
- **`/api/v1/models`** ([`lib/server/routes/models.ts`](lib/server/routes/models.ts)) renvoie une liste statique → candidat idéal pour `'use cache'` + `cacheLife('hours')`. Cursor vérifie ce endpoint à chaque "Verify".
- **`getSettings`** dans [`app/page.tsx`](app/page.tsx) et [`app/welcome/page.tsx`](app/welcome/page.tsx) : `modelSettings` est un singleton ; un `'use cache'` + `cacheTag('settings')` + `updateTag('settings')` dans `savePreferencesAction` ([`lib/server-actions.ts:32`](lib/server-actions.ts)) supprimerait `revalidatePath` (plus précis).
- **`getPlanQuotas`** ([`lib/server/model-settings.ts:53`](lib/server/model-settings.ts)) : table figée, `'use cache'` + `cacheLife('max')`.

Prérequis : activer `cacheComponents: true` dans [`next.config.ts`](next.config.ts) et supprimer les `dynamic = "force-dynamic"` des pages où on veut PPR.

---

## 3. `swr`

Globalement conforme.

### Low
- [`components/providers.tsx:18`](components/providers.tsx) — `errorRetryCount: 2` + `errorRetryInterval: 2_000` durs ; pas de `onErrorRetry` qui skipper les 4xx. Sur un 401/403 le client retry inutilement deux fois. Recommander un `onErrorRetry` qui regarde `error.status` (déjà exposé via `ClientApiError` dans [`lib/api-client.ts:3`](lib/api-client.ts)).
- Aucun `useSWRMutation` : tous les writes passent par Server Actions ([`lib/server-actions.ts`](lib/server-actions.ts)). C'est cohérent ; l'invalidation se fait via `revalidatePath`. À conserver.
- `dedupingInterval` non configuré → défaut 2 s. Pour des dashboards live qui se polluent (`refreshInterval: POLL_FAST` = ?), expliciter (lisibilité).

---

## 4. `convex-quickstart` + `convex-helpers-guide`

### High
- **`pkceState` est en mémoire, pas en Convex.** [`lib/server/routes/auth.ts:14`](lib/server/routes/auth.ts) utilise un `Map<string, …>` module-level. L'AGENTS.md déclare "5 tables : `requests`, `modelSettings`, `planUsageSnapshot`, `oauthTokens`, `pkceState`" mais [`convex/schema.ts`](convex/schema.ts) n'en a que 4. Conséquence : tout reload Next (ou redémarrage) **perd les flows OAuth en cours**, et un déploiement multi-process casserait silencieusement le callback. Migrer vers une table `pkceState` (avec TTL géré en mutation, pas via `setInterval`).
- **`oauthTokens` exposé en `mutation`/`query` publique.** [`convex/oauthTokens.ts:5`](convex/oauthTokens.ts) explique le rationale (pas de `setAdminAuth` côté HTTP client, trust = port 3210 bound 127.0.0.1). Acceptable pour le profil "single-user laptop", mais : ajouter un commentaire `// SECURITY:` sur **chaque** `query/mutation` (pas seulement en haut), et envisager `internalMutation` + un Convex action wrapper appelée depuis Next via une clé partagée.

### Medium
- **`convex-helpers` non installé.** Plusieurs patterns réinventés :
  - [`convex/_helpers.ts`](convex/_helpers.ts) `singletonUpsert` triple `as any` pour contourner les génériques. La paire `customQuery`/`customMutation` de `convex-helpers/server/customFunctions` permettrait un `singletonQuery` typé sans `as any`.
  - [`convex/requests.ts:108-129`](convex/requests.ts) `getRecentRequests` fait `take(limit + offset)` puis `slice` + un second scan pour `total`. À remplacer par `paginate()` natif (rule `use-pagination-for-large-datasets`).
- **`getRecentRequests` total recompte tout** ([`convex/requests.ts:124-129`](convex/requests.ts)) — `(await ctx.db.query("requests").withIndex(…).collect()).length` est O(n) à chaque page. Stocker un compteur dans `modelSettings` ou un table `counters` en `singletonUpsert` à chaque insert de `recordRequest`.

### Low
- [`convex/modelSettings.ts:24-25`](convex/modelSettings.ts) "soft migration" `claude-opus-4-6 → 4-7` au read time : OK mais à supprimer une fois la table backfillée. Marquer avec un `// TODO(remove after YYYY-MM)`.

---

## 5. `gsap-performance`

Très bonne hygiène.

### Constatations positives
- Tous les composants motion respectent `prefers-reduced-motion` via `withReducedMotion` ([`lib/motion.ts:30`](lib/motion.ts)).
- `ScrollTrigger.config({ ignoreMobileResize: true })` en place pour éviter `_refresh100vh` ([`lib/motion.ts:17`](lib/motion.ts)).
- `aurora-shader.tsx` fournit des `from` values explicites pour éviter `_getComputedProperty` ([`components/layout/aurora-shader.tsx:50-58`](components/layout/aurora-shader.tsx)).
- `IntersectionObserver` au lieu de `ScrollTrigger.create` dans `number-ticker.tsx` ([`components/motion/number-ticker.tsx:84`](components/motion/number-ticker.tsx)).

### Low
- `gsap.quickTo()` pas utilisé pour le "scroll" listener dans [`components/layout/app-shell.tsx:34`](components/layout/app-shell.tsx) (mais c'est du `setState` React, pas une animation — acceptable).
- `will-change: transform` sur `.aurora-mesh` ([`app/globals.css:243`](app/globals.css)) **mais** la classe ne semble pas utilisée ; le rendu réel est dans [`components/layout/aurora-shader.tsx`](components/layout/aurora-shader.tsx). Garder ou supprimer la classe (deslop).

---

## 6. `shadcn`

Conforme. Style `new-york`, `radix-ui` unifié (package unique, pas `@radix-ui/react-*` individuels), `components/ui/` exclu d'ESLint.

### Low
- [`components.json:7`](components.json) `tailwind.config: ""` (Tailwind v4 OK), mais `baseColor: "neutral"` alors que [`app/globals.css:36`](app/globals.css) utilise une palette violette OKLCH custom : la valeur `neutral` est cosmétique mais induit en erreur si on relance `shadcn add`. Mettre `"baseColor": "zinc"` (le plus proche) ou aligner.
- Aucun `Dialog` utilisé pour des actions destructives ; `AlertDialog` est déjà importé ([`components/ui/alert-dialog.tsx`](components/ui/alert-dialog.tsx)) — vérifier que `ResetButton` ([`components/usage/reset-button.tsx`](components/usage/reset-button.tsx)) l'utilise bien (pas Dialog).

---

## 7. `deslop`

### High — dead code
- **`frontend/`** ([`frontend/lib/server/db.ts`, `oauth.ts` vides ; `frontend/components/preferences/theme-toggle-card.tsx` vide](frontend/)) : squelette parallèle de zéro octet, déjà ignoré par ESLint ([`eslint.config.mjs:11`](eslint.config.mjs)) — **à supprimer en bloc**. Aucun import vers `frontend/*` dans le repo (`grep` confirme).
- **`ConvexReactClient` setup pour rien.** [`components/providers.tsx:16`](components/providers.tsx) instancie un client Convex côté browser, mais aucun composant n'utilise `useQuery`/`useMutation` (`grep convex/react` → 1 hit, le provider lui-même). Tout passe par SWR + `/api/*`. Soit retirer le provider, soit assumer et l'utiliser pour du real-time (ex. `requests` live).

### Medium
- [`convex/_helpers.ts`](convex/_helpers.ts) — 3 `eslint-disable @typescript-eslint/no-explicit-any` consécutifs. Re-typer via un overload générique `<T extends SingletonTable>` qui utilise `DataModel[T]["document"]` plutôt que `Record<string, unknown>`.
- [`convex/modelSettings.ts:5-10`](convex/modelSettings.ts) duplique les défauts `DEFAULT_SETTINGS` qui existent déjà dans [`lib/server/model-settings.ts:27`](lib/server/model-settings.ts). Risque de divergence — Convex et serveur peuvent défaulter différemment. À factoriser (ou commenter le pourquoi de la duplication).
- Préfixe `_helpers.ts` (avec underscore) en tête de fichiers Convex peut conflicter avec les conventions Convex (qui réserve `_generated`). Renommer en `helpers.ts` ou `lib.ts`.

### Low
- [`components/integrations/snippet-card.tsx`](components/integrations/snippet-card.tsx) + [`snippets.ts`](components/integrations/snippets.ts) : architecture pour "cursor" uniquement (commentée). Si vraiment 1 client, simplifier le typage `SnippetSource` en `string`.
- Commentaires AI-style verbeux : OK ici, ils documentent des décisions de design réelles (pricing, OAuth, rate-limit). Aucune purge nécessaire.

---

## 8. `security-review`

Aucun **Critical** / **High** confirmé. Quelques **Medium** + **Low** à surveiller.

### Medium
- **`pkceStore` en mémoire** (déjà mentionné §4) — la **réutilisation d'un `state`** n'est protégée que par la TTL Map. En cas de redémarrage entre `/login` et `/callback`, l'attaquant ne peut rien forger (PKCE), mais l'utilisateur croit avoir foiré son OAuth. Migration Convex recommandée.
- **`x-forwarded-for` non assaini.** [`lib/server/middleware.ts:36`](lib/server/middleware.ts) prend la première valeur de `x-forwarded-for` directement. En **local**, n'importe qui sur le LAN peut spoofer le header et bypasser le whitelist. Atténué par : (a) le tunnel Cloudflare met `cf-connecting-ip` qui prime, (b) `next dev -p 3111` n'est exposé qu'en localhost. Documenter la dépendance — ne **jamais** binder le port `3111` sur `0.0.0.0`.
- **`SETTINGS_API_KEY` voyage en clair sur le loopback.** [`lib/api.ts:66`](lib/api.ts) le serveur RSC fait `fetch('http://127.0.0.1:3111/api/settings')` avec `x-settings-key`. Loopback non chiffré → OK localement, mais si on fait jamais tourner sur un host partagé, autre service local pourrait `tcpdump` lo. Acceptable pour le profil "laptop perso" ; à mentionner.
- **CORS `Access-Control-Allow-Credentials: true` + écho d'origine.** [`lib/server/middleware.ts:62-77`](lib/server/middleware.ts) renvoie `*` en fallback si l'origine n'est pas dans l'allow-list, **ET** active `Allow-Credentials`. La spec interdit `*` avec credentials ; les browsers rejettent silencieusement, mais : pour des clients programmatiques (Cursor), l'echo peut élargir la surface. Préciser : si pas d'origine matchée → omettre `Access-Control-Allow-Origin` plutôt que renvoyer `*`.

### Low
- Logger ([`lib/server/logger.ts:50`](lib/server/logger.ts)) écrit des `[DEBUG]/[VERBOSE]` qui peuvent inclure du payload OAuth en cas de bug futur. Bien que `oauth.ts` ne logue jamais le token, ajouter un linter rule (regex sur `accessToken|refreshToken`) au CI serait robuste.
- [`convex/oauthTokens.ts:13-31`](convex/oauthTokens.ts) `query get` retourne le `accessToken` et `refreshToken` en clair côté wire. Sur réseau Docker localhost-only c'est OK ; documenter explicitement le risque.
- `app/error.tsx` ([`app/error.tsx:28`](app/error.tsx)) affiche `error.message` brut au visiteur. En dev OK, en prod préférer un message générique + masquage si `process.env.NODE_ENV === "production"`.

---

## Top-5 actions recommandées (par ROI)

1. **Supprimer `frontend/`** — 0 risque, gain immédiat de propreté ([deslop](#7-deslop)).
2. **Migrer `pkceStore` vers Convex** — corrige un drift de doc + un bug de production sous restart ([§4](#4-convex-quickstart--convex-helpers-guide), [§8](#8-security-review)).
3. **Activer `cacheComponents` + retirer `force-dynamic` global** — débloque PPR/`'use cache'` pour `models`, `settings`, `planQuotas` ([§1](#1-next-best-practices), [§2](#2-next-cache-components)).
4. **Re-typer `singletonUpsert`** sans `as any` (overload + `DataModel[T]`) ([§4](#4-convex-quickstart--convex-helpers-guide)).
5. **Soit retirer le `ConvexProvider` côté client, soit l'utiliser** pour du live (ex. `useQuery(api.requests.getRecentRequests)` sur la page Usage — supprime le polling SWR de `/api/analytics/requests`) ([§7](#7-deslop)).

## Hors scope (non auditable depuis le code seul)
- `pnpm build --analyze` pour valider `optimizePackageImports`.
- `pnpm run lint` exécution réelle.
- Test du Lighthouse / Core Web Vitals sur `/usage` (heavy charts + GSAP).
