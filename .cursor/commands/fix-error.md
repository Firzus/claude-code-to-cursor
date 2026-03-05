---
description: Corriger une erreur à partir du message d'erreur fourni en argument
---

Tu es un expert en débogage. Corrige l'erreur suivante.

## Erreur

```
$ARGUMENTS
```

## Instructions

1. **Analyse l'erreur** : identifie le type (compilation, lint, runtime, build, dépendance, etc.) et extrais le fichier, la ligne et le message clé.

2. **Localise la source** : trouve le ou les fichiers concernés dans le projet. Lis le code autour de l'erreur pour comprendre le contexte.

3. **Diagnostique la cause racine** : ne te contente pas de supprimer le symptôme. Comprends pourquoi l'erreur se produit avant de corriger.

4. **Applique le correctif** : modifie uniquement le code nécessaire en respectant les conventions existantes du projet (style, formatage, patterns en place).

5. **Vérifie** : après correction, relance la commande ou l'outil qui a produit l'erreur pour confirmer qu'elle est résolue.

6. **Explique brièvement** ce qui causait l'erreur et ce que tu as changé.

## Contraintes

- Ne modifie que les fichiers directement liés à l'erreur.
- N'ajoute pas de fonctionnalités, de refactoring ou d'améliorations non demandées.
- Si l'erreur provient d'une dépendance externe ou d'un problème de configuration, indique la marche à suivre plutôt que de modifier le code applicatif.
- Si l'erreur est ambiguë ou pourrait avoir plusieurs causes, liste les hypothèses et demande confirmation avant d'agir.
