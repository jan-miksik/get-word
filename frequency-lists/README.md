# Frequency lists

Reference vocabulary ordered from most to least frequent: one word per line,
no header, 5,000 lines per language. **Keep the order stable when consuming
these files — the line position is the frequency rank.**

| file | language |
| --- | --- |
| `czech_5000.txt` | Czech |
| `english_5000.txt` | English |
| `vietnamese_5000.txt` | Vietnamese |

## Where they come from

Derived from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by
Hermit Dave, which counts words in the
[OpenSubtitles 2018](https://opus.nlpl.eu/OpenSubtitles-v2018.php) corpus.
Downloaded 2026-10-16 from
`https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/<lang>/<lang>_50k.txt`
(`cs`, `en`, `vi`).

The source data is licensed **CC BY-SA 4.0**, so these files and any further
adaptation of them stay under that licence — see `LICENSE` in this directory.
The rest of the repository is Apache-2.0; this directory is the one exception,
and the app credits the source in its terms page.

## What was changed

The files here are modified versions of the source lists:

- occurrence counts stripped, leaving the word alone on each line;
- lowercased and de-duplicated;
- entries containing anything other than that language's letters (digits,
  punctuation, stray symbols) dropped — an apostrophe is kept for English;
- truncated to the first 5,000 surviving entries.

Reproducing it needs the raw file plus that filter; the counts dropped were 26
(cs), 52 (en) and 592 (vi) out of the lines read.

## What they are not

OpenSubtitles is film and television dialogue, so the ranking reflects spoken
language — it leans on conversation, and the lower ranks of a list may contain
foreign words that appear often in that language's subtitles. Treat these as a
frequency reference, not as a curated syllabus.

Two limitations matter before anything is built on them. These are **word-form
frequencies, not lemma frequencies**: `má`, `máš` and `máme` are three separate
entries with three separate ranks, which in an inflected language like Czech
spreads one word across dozens of rows and makes 5,000 rows cover far fewer
distinct words than the count suggests. And subtitles are full of **proper
names**, which rank high because characters address each other constantly;
nothing here filters them out.

A better source would be a lemmatised list with part-of-speech tags and names
removed — for Czech, the lemmatised frequency lists from the Czech National
Corpus are the obvious candidate and are published under CC0. Replacing these
files is the plan, not a refinement of them.

When replacing or extending them with another dataset, record its source,
version and licensing information in the same change.
