import React, { useEffect, useRef, useState } from 'react';
import { getSuggestions } from './suggestions';

export default function App() {
  const [word, setWord] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pf-history') || '[]'); } catch { return []; }
  });
  const [suggestions, setSuggestions] = useState([]);
  const audioRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('pf-history', JSON.stringify(history.slice(0, 20))); } catch (e) {}
  }, [history]);

  async function lookup(w) {
    const query = (w || word || '').trim();
    if (!query) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(query));
      if (!res.ok) throw new Error('not-found');
      const data = await res.json();

      const phonetics = [];
      const audios = [];

      if (Array.isArray(data)) {
        data.forEach(entry => {
          if (Array.isArray(entry.phonetics)) {
            entry.phonetics.forEach(p => {
              if (p && p.text && !phonetics.includes(p.text)) phonetics.push(p.text);
              if (p && p.audio && !audios.includes(p.audio)) audios.push(p.audio);
            });
          }
        });
      }

      const meanings = (data && data[0] && data[0].meanings) ? data[0].meanings : [];
      const payload = { word: (data && data[0] && data[0].word) ? data[0].word : query, phonetics, audios, meanings };

      setResult(payload);
      setHistory(prev => [payload.word, ...prev.filter(x => x.toLowerCase() !== payload.word.toLowerCase())].slice(0, 20));
    } catch (err) {
      setError('Word not found in dictionary API — using SpeechSynthesis fallback.');
      setResult({ word: query, phonetics: [], audios: [], meanings: [] });
      setHistory(prev => [query, ...prev.filter(x => x.toLowerCase() !== query.toLowerCase())].slice(0, 20));
    } finally {
      setLoading(false);
    }
  }

  function playAudio(url) {
    if (!url) {
      speak(result?.word);
      return;
    }
    const normalized = url.startsWith('//') ? 'https:' + url : url;
    if (audioRef.current) {
      audioRef.current.src = normalized;
      audioRef.current.play().catch(() => speak(result?.word));
    } else {
      const a = new Audio(normalized);
      a.play().catch(() => speak(result?.word));
    }
  }

  function speak(text) {
    if (!text) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const enVoice = (voices && voices.find(v => v.lang && v.lang.startsWith('en')));
    if (enVoice) utter.voice = enVoice;

    if (!voices || voices.length === 0) {
      const onVoices = () => {
        const vs = window.speechSynthesis.getVoices();
        const v = vs.find(x => x.lang && x.lang.startsWith('en'));
        if (v) utter.voice = v;
        window.speechSynthesis.speak(utter);
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      window.speechSynthesis.speak(utter);
    } else {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    }
  }

  useEffect(() => {
    let mounted = true;
    if (word && word.trim().length >= 2) {
      getSuggestions(word).then(list => { if (mounted) setSuggestions(list || []); }).catch(() => { if (mounted) setSuggestions([]); });
    } else {
      setSuggestions([]);
    }
    return () => { mounted = false; };
  }, [word]);

  return (
    <div style={{ padding: 18 }}>
      <div className="container">
        <div className="header">
          <div>
            <h1>Pronunciation Finder</h1>
            <div className="small">Type a word, see phonetic spellings and play pronunciations.</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              placeholder="Type a word (e.g. 'colonel')"
              value={word}
              onChange={e => setWord(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
            />

            {suggestions && suggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, background: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', zIndex: 30 }}>
                {suggestions.slice(0, 6).map((s, i) => (
                  <div key={i} className="suggestion" onClick={() => { setWord(s); setSuggestions([]); lookup(s); }}>{s}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="button" style={{ background: '#3730a3', color: 'white' }} onClick={() => lookup()}>Search</button>
            <button className="button" style={{ marginLeft: 8 }} onClick={() => { setWord(''); setResult(null); setError(''); }}>Reset</button>
          </div>

          {loading && <div style={{ marginTop: 12 }}>Loading...</div>}
          {error && <div style={{ marginTop: 12, color: '#92400e' }}>{error}</div>}

          {result && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>{result.word}</h2>
                <div>
                  <button className="button" onClick={() => result.audios && result.audios.length ? playAudio(result.audios[0]) : speak(result.word)}>Play</button>
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <strong>Phonetics:</strong> {result.phonetics && result.phonetics.length ? result.phonetics.join(', ') : '—'}
              </div>

              {result.meanings && result.meanings.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong>Meanings:</strong>
                  {result.meanings.map((m, idx) => (
                    <div key={idx} style={{ marginTop: 8 }}>
                      <div style={{ fontStyle: 'italic' }}>{m.partOfSpeech}</div>
                      <ul>
                        {(m.definitions || []).slice(0, 3).map((d, di) => (
                          <li key={di}>{d.definition}{d.example ? ` — "${d.example}"` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 600 }}>History</div>
            <div style={{ marginTop: 8 }}>
              {(history && history.length) ? history.map((h, i) => (
                <button key={i} className="history-button" onClick={() => { setWord(h); lookup(h); }}>{h}</button>
              )) : <div className="small">No recent searches</div>}
            </div>
          </div>

        </div>

        <audio ref={audioRef} />
      </div>
    </div>
  );
}