# url2mark ✍️ par michben

Convertissez n'importe quelle page web en **Markdown propre**. Une version améliorée de [urltomarkdown.com](https://urltomarkdown.com/), conçue et signée **michben**.

## Ce qui est mieux que l'original

- **Aperçu en direct** du rendu, avec une vue *côte à côte* Markdown / rendu
- **Markdown modifiable** avant de le copier ou de le télécharger
- **Copier**, **télécharger en `.md`** (nom de fichier tiré du titre) et **lien partageable** (`?url=…`)
- **Options** : article seul (Readability) ou page complète, titre, front matter YAML (Obsidian, Hugo…), images, tableaux GFM, liens en ligne / en référence / supprimés, signature michben
- **Mode « HTML collé »** pour convertir du HTML sans URL
- Blocs de code avec leur **langage** conservé (```` ```python ````), liens et images en **URL absolues**
- Statistiques : mots, temps de lecture, caractères
- **Historique** local des dernières conversions, préférences mémorisées
- **Thème sombre**, interface responsive, raccourci <kbd>Ctrl</kbd>+<kbd>Entrée</kbd>
- **API** JSON ou texte, protégée contre les requêtes vers des adresses internes (SSRF), avec délai et taille maximale

## Démarrer

Node.js 20 ou plus récent.

```bash
npm install
npm start          # http://localhost:3000
npm test
```

Variables d'environnement : `PORT` (défaut 3000), `URL2MARK_ALLOW_PRIVATE=1` pour autoriser les adresses locales (développement uniquement).

## API

```bash
# Markdown brut
curl "http://localhost:3000/api/convert?url=https://exemple.com&format=text"

# JSON avec métadonnées (title, byline, excerpt, words, readingMinutes, markdown)
curl -X POST http://localhost:3000/api/convert \
  -H "content-type: application/json" \
  -d '{"url":"https://exemple.com","links":"reference","frontmatter":true}'
```

| Paramètre | Valeurs | Défaut |
| --- | --- | --- |
| `url` ou `html` | URL à récupérer ou HTML à convertir | |
| `readability` | `true` / `false` : article seul | `true` |
| `title` | ajoute `# Titre` | `true` |
| `frontmatter` | en-tête YAML | `false` |
| `images`, `tables` | conserver images / tableaux | `true` |
| `links` | `inline`, `reference`, `none` | `inline` |
| `format` | `json`, `text` | `json` |

## Application Android (APK)

L'APK embarque la conversion : elle tourne directement sur le téléphone, sans serveur.

- **Télécharger** : onglet [Releases](https://github.com/michben/url2mark/releases/latest) → `url2mark-michben.apk`. Chaque push le recompile via GitHub Actions (`.github/workflows/android-apk.yml`).
- **Partager depuis Chrome** : menu *Partager* → *url2mark* convertit directement la page.
- **Enregistrer .md** écrit le fichier dans `Documents/url2mark/`, **Partager** envoie le Markdown vers une autre application.

Compiler soi-même (Android SDK + JDK 21) : `npm run android:apk`, puis `android/app/build/outputs/apk/debug/app-debug.apk`.

---

<p align="center"><em>— michben</em></p>
