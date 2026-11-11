# Fact-check sheet

Verify every row with a primary or reputable source (web search). Set status to OK (true as written), FIX (rewrite the
sentence, then re-run), or STORY (deliberate story framing around a true mechanism, say which part is invented).
`story.py verify claims.md` blocks production until every row is OK/STORY with a source URL.

| id | sentence | claim | why checked | status | source |
|---|---|---|---|---|---|
| C1 | 1 | This man shaves a sliver of silver off every coin he touches, then spends the coin anyway. | absolute/superlative | STORY | https://newtonandthemint.history.ox.ac.uk/transcriptions/diplomatic/MINT01093 (clipping with shears and filing the edge are documented; a clipped coin still passed at face value). "This man" is an invented, unnamed clipper. |
| C2 | 2 | In sixteen-hundreds England, coins are hammered by hand. | named entity | OK | https://www.royalmintmuseum.org.uk/journal/british-monarchs/charles-ii/ (hand-struck coins: uneven and irregular until machine striking from 1662) |
| C3 | 5 | By Friday he has a lump of other people's silver. | named entity | STORY | https://en.wikipedia.org/wiki/Coin_clipping (clippings were melted into bullion and sold; pointer, confirmed by the Mint memorandum above). "By Friday" is invented pacing; no per-clipper yield is documented. |
| C4 | 7 | By 1695, a sack of coins weighs barely half of what it should. | number/date | OK | https://archive.org/download/historyofengland06macauoft/historyofengland06macauoft.pdf (1695 Exchequer test as told by Macaulay: 300 pounds of coin that should weigh about 1,200 oz weighed 624 oz, 52 %) |
| C5 | 13 | In 1696, a new warden arrives at the Mint. | number/date, named entity | OK | https://www.royalmintmuseum.org.uk/journal/people/isaac-newton/ (Warden from spring 1696) |
| C6 | 14 | Isaac Newton. | named entity | OK | https://www.royalmint.com/stories/commemorate/sir-isaac-newton-and-the-royal-mint/ (Warden 1696, Master from the end of 1699; ran the pursuit of coiners) |
| C7 | 15 | That year, every old hammered coin in England is called in and melted. | named entity, absolute/superlative | OK | https://newtonandthemint.history.ox.ac.uk/great-recoinage/the-great-recoinage (Great Recoinage begun 1696: the old hammered silver was recalled and recoined; it ran to 1699, and hammered silver lost legal status in stages to December 1697) |
| C8 | 16 | You see, the replacements come from a machine the Mint has used since 1662: perfectly round, with a marked edge. | number/date, named entity | OK | https://www.royalmintmuseum.org.uk/journal/british-monarchs/charles-ii/ (machine striking with marked edges at the Tower Mint from 1662, Blondeau; large coins lettered DECUS ET TUTAMEN). The script does NOT credit Newton with the edge: that is a myth. |
| C9 | 18 | The first time he tries, he's caught. | absolute/superlative | STORY | https://physicsworld.com/a/the-giant-and-the-thief/ (Newton's prosecutions of coiners are documented; William Chaloner was hanged in March 1699). The capture of our unnamed clipper is invented; a cut on a marked edge is visible at once, which is the true mechanism. |
| C10 | 19 | And that is why a quarter still has one hundred nineteen ridges, guarding silver it lost in 1965. | number/date | OK | https://www.mentalfloss.com/article/28044/how-many-ridges-are-quarter-and-why-are-they-there-first-place (119 reeds on a US quarter, 118 on a dime, from US Mint specifications; silver removed by the Coinage Act of 1965); https://kids.usmint.gov/about-the-mint/dime (reeding added to stop filing for silver) |

Not used on purpose (weak or disputed): "10 % of coins were counterfeit", "Newton in disguise in taverns", "100 interrogations / 28
convictions", the exact recoinage total (sources give 5.1 and 6.8 million pounds), and how Chaloner was executed beyond "hanged".
The two spoken lines ("This shilling is too small." / "It shrank in the wash.") are invented dialogue.
