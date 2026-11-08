#!/usr/bin/env python3
"""Compte, par jour (heure locale), dans ~/.claude/projects/**/*.jsonl :
- les messages qu'Ilian envoie (hors sous-agents, hors messages automatiques) ;
- les tokens consommés (entrée + sortie + écriture et lecture du cache), sous-agents compris,
  chaque réponse comptée une seule fois (message.id + requestId).
Cache incrémental : un fichier déjà lu n'est relu que si sa taille ou sa date a changé.
Sortie : {"jours": {...}, "tokens": {...}, "auj": "AAAA-MM-JJ", "tz": minutes, "maj": epoch}"""
import json, os, time
from datetime import datetime

BASE = os.path.expanduser("~/.claude/projects")
CACHE = os.path.expanduser("~/.claude/usage-grid/cache.json")
VERSION = 2
SKIP = ("<command-", "<local-command", "<bash-", "<system-reminder", "Caveat:")


def jour_de(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")


def compter(path, sous_agent):
    msgs, toks, vus = {}, {}, set()
    with open(path, "rb") as f:
        for ligne in f:
            est_user = b'"type":"user"' in ligne
            est_tok = b'"usage"' in ligne and b'"type":"assistant"' in ligne
            if not (est_user or est_tok):
                continue
            try:
                d = json.loads(ligne)
                jour = jour_de(d["timestamp"])
            except Exception:
                continue
            if d.get("type") == "assistant":
                m = d.get("message") or {}
                u = m.get("usage") or {}
                cle = (m.get("id"), d.get("requestId"))
                if cle[0] and cle in vus:
                    continue
                vus.add(cle)
                n = sum(int(u.get(k) or 0) for k in ("input_tokens", "output_tokens",
                        "cache_creation_input_tokens", "cache_read_input_tokens"))
                if n:
                    toks[jour] = toks.get(jour, 0) + n
                continue
            if sous_agent or d.get("type") != "user" or d.get("isMeta") or d.get("isSidechain"):
                continue
            c = (d.get("message") or {}).get("content")
            if isinstance(c, list):
                if any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c):
                    continue
                txt = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
            else:
                txt = c or ""
            if not txt.strip() or txt.lstrip().startswith(SKIP):
                continue
            msgs[jour] = msgs.get(jour, 0) + 1
    return msgs, toks


try:
    cache = json.load(open(CACHE))
    if cache.get("_v") != VERSION:
        cache = {}
except Exception:
    cache = {}
vu = {"_v": VERSION}
for racine, _, fichiers in os.walk(BASE):
    sous_agent = os.sep + "subagents" in racine or "/subagents" in racine
    for n in fichiers:
        if not n.endswith(".jsonl"):
            continue
        p = os.path.join(racine, n)
        try:
            st = os.stat(p)
        except OSError:
            continue
        cle = f"{st.st_size}:{int(st.st_mtime)}"
        old = cache.get(p)
        if old and old.get("cle") == cle:
            vu[p] = old
            continue
        try:
            m, t = compter(p, sous_agent)
            vu[p] = {"cle": cle, "jours": m, "tokens": t}
        except Exception:
            continue
tmp = CACHE + ".tmp"
json.dump(vu, open(tmp, "w"))
os.replace(tmp, CACHE)
jours, tokens = {}, {}
for p, v in vu.items():
    if p == "_v":
        continue
    for j, k in v["jours"].items():
        jours[j] = jours.get(j, 0) + k
    for j, k in v["tokens"].items():
        tokens[j] = tokens.get(j, 0) + k
now = datetime.now().astimezone()
print(json.dumps({"jours": jours, "tokens": tokens, "auj": now.strftime("%Y-%m-%d"),
                  "tz": int(now.utcoffset().total_seconds() // 60), "maj": int(time.time())}))
