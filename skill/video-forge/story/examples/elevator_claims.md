# Fact-check sheet

Verify every row with a primary or reputable source (web search). Set status to OK (true as written), FIX (rewrite the
sentence, then re-run), or STORY (deliberate story framing around a true mechanism, say which part is invented).
`story.py verify claims.md` blocks production until every row is OK/STORY with a source URL.

| id | sentence | claim | why checked | status | source |
|---|---|---|---|---|---|
| C1 | 1 | In 1854, a man stood high above a crowd and ordered the only rope holding him cut. | number/date, absolute/superlative | OK | https://www.britannica.com/topic/Elisha-Otis (May 1854 demo at the New York Crystal Palace; the hoisting rope was cut while he stood on the raised platform) |
| C2 | 3 | So nobody wanted to ride one, and most buildings stopped at five or six floors of stairs. | absolute/superlative | OK | https://indianapublicmedia.org/amomentofscience/history-otis-elevators/ (about six stories was the practical stair limit); "nobody wanted to ride" = framing of the public distrust of hoists |
| C3 | 5 | His name was Elisha Otis. | named entity | OK | https://www.asme.org/topics-resources/content/elisha-graves-otis |
| C4 | 6 | He tipped his hat, and the helper swung the axe. | staging | STORY | https://www.6sqft.com/?p=109148 (axe per the Otis company account; some illustrations show a knife). The hat tip is invented staging. |
| C5 | 8 | The platform dropped, and stopped. Just a few inches down. | number | OK | https://greatpatent.com/elisha-otis-didnt-invent-the-elevator-he-invented-not-falling (fell only a few inches before it stopped) |
| C6 | 11-12 | a steel wagon spring sat on top, bent tight by the rope's pull; slack -> flat -> ends jam into teeth on the rails | mechanism | OK | https://www.asme.org/topics-resources/content/elisha-graves-otis (wagon spring + ratchet bars on the guide rails; the spring engages the ratchet when rope tension is lost) |
| C7 | 15 | Three years later, a five-floor store in New York got the first passenger elevator. | named entity, absolute/superlative | OK | https://en.wikipedia.org/wiki/E._V._Haughwout_Building (23 March 1857, five storeys, first commercial passenger elevator) |
| C8 | 16-17 | He died in 1861, decades before the first skyscraper his cut rope made possible. | number/date, absolute/superlative | OK | https://www.britannica.com/topic/Elisha-Otis (died 1861); first skyscraper usually dated to the Home Insurance Building, Chicago, 1885 = 24 years later |
