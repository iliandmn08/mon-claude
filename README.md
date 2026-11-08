# Mon Claude

Un module pour Claude Code qui montre ton utilisation de Claude, directement dans l'app :

- **une ligne au-dessus de la zone de saisie** : les 14 derniers jours en petits carrés, les tokens du jour, le total, et une mini-barre de la limite de la semaine ;
- **un panneau « Mon Claude » sur le côté** (ouvert tout seul, ou avec le bouton *Détails* / la commande `/mon-claude`) : la grille d'activité façon GitHub (un carré par jour, coloré selon les tokens, avec la légende), les messages du jour, des 7 derniers jours, la série de jours d'affilée, les tokens du jour et depuis le début, et la jauge de la limite de la semaine avec un trait blanc qui montre le rythme régulier (où tu « devrais » être à ce moment de la semaine).

Les chiffres viennent des conversations enregistrées sur ton ordinateur (`~/.claude/projects`) ; rien n'est envoyé nulle part. La limite de la semaine est celle que Claude renvoie à chaque réponse (abonnement Pro / Max seulement).

## Installer

Dans un terminal, lance :

```
claude plugin marketplace add iliandmn08/mon-claude
claude plugin install usage-grid@ilian-mods --scope user
```

Ou, à l'invite de Claude Code dans un terminal :

```
/plugin install usage-grid --marketplace iliandmn08/mon-claude
```

Dans l'app Claude (onglet Code) : bouton **+** à côté de la zone de saisie → Plugins → Add marketplace `iliandmn08/mon-claude` → Add plugin.

Ensuite, ouvre une nouvelle conversation : le panneau et la ligne apparaissent tout seuls.

## Ce qu'il faut

- Claude Code récent (avec les modules / hooks de plugin).
- Python 3 (`python3`, `python` ou `py`) : il compte les messages et les tokens par jour. Le premier passage lit tout l'historique (quelques secondes), ensuite seulement ce qui a changé.

## Comment c'est compté

- **Messages** : ce que tu tapes toi-même (pas les réponses, pas les sous-agents, pas les messages automatiques).
- **Tokens** : entrée + sortie + écriture et lecture du cache, sous-agents compris, chaque réponse comptée une seule fois. La relecture du cache en fait la plus grosse partie, d'où des totaux en milliards : ça ne veut pas dire que la limite explose — c'est la barre de la semaine qui dit où tu en es.
