/**
 * The freestyle History page as a single coherent article: how freestyle evolved from a
 * handful of tricks into a movement language with names, notation, classification, and this
 * encyclopedia. Organized entirely around one thesis (each generation expanded the shared
 * vocabulary), with the encyclopedia's own pages as the factual foundation: Competition and
 * Insights numbers are woven in as evidence, the Hall of Fame and BAP are integrated as the
 * recognition institutions, and the dictionary and glossary are where the language is
 * organized. Rendered on a public surface, so the prose carries no em dashes and states only
 * what our own pages and settled record support; uncertain dates and inventors are omitted or
 * stated at a higher level, to be refined in a future revision.
 */

export interface HistoryLink {
  label:    string;
  href:     string;
  external?: boolean;
}

export interface HistorySection {
  id:         string;
  heading:    string;
  paragraphs: readonly string[];
  links?:     readonly HistoryLink[];
}

export interface HistoryNarrative {
  thesis:     string;
  intro:      readonly string[];
  sections:   readonly HistorySection[];
  references: readonly HistoryLink[];
  whereNext:  readonly HistoryLink[];
}

export const HISTORY_NARRATIVE: HistoryNarrative = {
  thesis:
    'Freestyle did not become more difficult simply because players got better. It evolved because each generation introduced new ideas that expanded the shared vocabulary available to everyone who followed.',
  intro: [
    'Freestyle footbag is a language. What began as a handful of ways to keep a small bag in the air grew, over four decades, into a vocabulary of hundreds of named tricks, a notation for writing them down, and a system for organizing them into families. This page is the story of how that happened, and why an encyclopedia like this one came to exist.',
    'The usual way to tell the story is that players got better. That is true, but it misses the point. Freestyle got harder because each generation added new ideas to a shared vocabulary, and every player who followed inherited them. A trick one person worked out became a word everyone could use. The history of freestyle is the history of that vocabulary expanding.',
  ],
  sections: [
    {
      id: 'origins',
      heading: 'A handful of tricks',
      paragraphs: [
        'Footbag began in Oregon in the early 1970s, when Mike Marshall and John Stalberger started kicking a small bag to keep it in the air using only the feet and legs. Out of that simple game grew several disciplines, and one of them, freestyle, was about tricks: stalls, dexterities, and the ways to link them.',
        'In the early years the vocabulary was small enough that a dedicated player could learn most of what was known, then set about adding to it. Almost everything that came later grew out of that first small set of moves. What the sport needed next was a place for that adding to happen in front of other people.',
      ],
      links: [
        { label: 'Footbag Hall of Fame', href: '/hof' },
      ],
    },
    {
      id: 'competition',
      heading: 'Competition spread new ideas',
      paragraphs: [
        'Once footbag organized into contests, freestyle had somewhere to grow in public. A trick that scored well, or that no one else could do, spread the moment it was performed in front of other players. Competition was never only a test of skill; it was one of the main ways a private discovery became part of everyone\'s vocabulary.',
        'It also widened the pool of people doing the discovering. The documented event record grew from a couple of dozen contests in freestyle\'s first decade to well over a hundred at its peak, and the field turned international along the way. The most decorated freestyle competitor on record, Vaclav Klouda of the Czech Republic, sits alongside champions from Switzerland, Poland, and the United States. More players in more places meant more ideas entering the shared language, and reaching it faster.',
      ],
      links: [
        { label: 'Competition', href: '/freestyle/competition' },
        { label: 'Records', href: '/freestyle/records' },
      ],
    },
    {
      id: 'vocabulary',
      heading: 'The vocabulary expanded by composition',
      paragraphs: [
        'The clearest sign that freestyle grew as a language is how the tricks multiplied. They did not multiply because players invented hundreds of unrelated moves. They multiplied by composition: a small set of operators, ways of modifying a trick, layered onto a small set of base movements.',
        'A single operator can generate a whole family of tricks. In the dictionary today, the most productive operators, symposium, ducking, spinning, and paradox, each appear on roughly eighty to a hundred and ten different tricks. Learn the operator once, and every base it touches becomes a new trick you can name. This way of building, by naming what you do to a trick rather than inventing a wholly new one, took hold once modifiers like paradox and symposium came into common use, and it became the engine of the whole vocabulary: not endless invention, but the systematic combination of a few good ideas.',
      ],
      links: [
        { label: 'Operators', href: '/freestyle/operators' },
        { label: 'Glossary', href: '/freestyle/glossary' },
      ],
    },
    {
      id: 'structure',
      heading: 'Some tricks became the structure of the language',
      paragraphs: [
        'Not every trick carries equal weight. As the vocabulary grew, a few movements became its structure, the points that everything else connects through. In a documented archive of competitive sequences, one trick stands apart: the whirl. It is the most-used trick in the record by a wide margin, and it is also the most connected, linking to more different tricks than anything else. The single most common two-trick structure in the whole archive is simply a blurry whirl landing into a whirl.',
        'The whirl became central not because it is flashy but because it returns a player to a reusable position, so a combination can keep going. A language needs connectors, and freestyle found one. The same is true at the other end of a move: a few endings and a few families came to organize how everything resolves.',
      ],
      links: [
        { label: 'Insights', href: '/freestyle/insights' },
        { label: 'Whirl', href: '/freestyle/families/whirl' },
      ],
    },
    {
      id: 'difficulty',
      heading: 'Difficulty became a moving ceiling',
      paragraphs: [
        'Difficulty in freestyle has a name and a number. A trick\'s added difficulty is measured in ADD, and the harder the combination, the higher the score. The record of the hardest documented sequences reads like a moving ceiling: a seven-trick run scored in the low twenties in the late 2000s, with a cluster of the next-hardest sequences spread across two decades of play.',
        'Each generation pushed that ceiling higher, and it could only rise because the vocabulary underneath it kept expanding. A single new modifier could lift the whole scale: when blurry, which adds a fast rotation to tricks players already knew, came into the vocabulary, it raised the top of the difficulty curve, and runs in which every trick cleared a high ADD threshold became the new mark of a top performance. Difficulty is not separate from the language; it is the language getting richer, measured.',
      ],
      links: [
        { label: 'ADD Analysis', href: '/freestyle/add-analysis' },
      ],
    },
    {
      id: 'notation',
      heading: 'Naming, then notation, became necessary',
      paragraphs: [
        'A vocabulary can be carried in different ways, and freestyle outgrew each one in turn. While the moves were few, a trick could be passed from one player to the next by demonstration: watch it, copy it, learn its name. As the vocabulary grew, demonstration was not enough on its own, and consistent names became the way players shared tricks they might never see performed. But as the named tricks exploded, names alone began to fail. Two players could use the same word for different moves, or different words for the same one, and a name told you nothing about how a trick was actually built.',
        'In 1995 Ben Job proposed a way past this, in a paper he shared with the footbag community titled "By the Way, Not the Name." Instead of identifying a trick by its name, he described it by its structure: a set, a series of movements, and a catch, written as a formula. Mirage stopped being only a name and became a form you could read on the page. Two things fell out of this. The notation captured the relationships between tricks, showing how one was a variation of another, and it could generate every possible variation, not only the ones players had already named and performed.',
        'This was the point where freestyle began to be written structurally, independent of any single player. A notation turned a folk vocabulary into something that could be recorded, compared, analyzed, and taught precisely, the same to every reader. It is what lets an entry in this dictionary mean exactly one thing, and it is the foundation everything structural in the encyclopedia is built on.',
      ],
      links: [
        { label: 'Ben Job\'s 1995 notation paper', href: '/freestyle/notation-article' },
        { label: 'How trick names work', href: '/freestyle/glossary#section-notation' },
      ],
    },
    {
      id: 'institutions',
      heading: 'Institutions preserved and spread the language',
      paragraphs: [
        'Innovation only matters to a sport if it becomes shared, and that took institutions. Two of them exist to recognize it. The Footbag Hall of Fame, founded in the 1990s by the sport\'s early pioneers, honors the players, champions, and promoters who turned a back-yard game into a global one. The Big Add Posse, named after the ADD difficulty metric itself, is an invite-only circle you enter only by shredding at the frontier, so it recognizes exactly the players who expand what is possible.',
        'Other institutions preserved and spread the knowledge. Footbag World, the print magazine and catalog of the sport\'s early decades, carried news, how-to, and results between players and pushed footbag into the mainstream. Later, footbag.org gathered the community and its move lists online, and more recently video channels such as PassBack have taught and named tricks for a new generation. The line from print to web to video is itself the story of how the vocabulary was carried forward.',
      ],
      links: [
        { label: 'Hall of Fame', href: '/hof' },
        { label: 'Big Add Posse', href: '/bap' },
      ],
    },
    {
      id: 'classification',
      heading: 'Classification organized the vocabulary',
      paragraphs: [
        'Carrying a vocabulary forward eventually means organizing it. Once freestyle\'s tricks numbered in the hundreds, they had to be grouped: tricks that share a core movement into families, and the operators that modify them named and defined. This is the work of classification, and it is what turns a long list of tricks into a language you can reason about. Knowing that a trick is a whirl with an operator added already tells you most of what it is.',
        'That grouping is what makes the vocabulary usable rather than merely large, and it is the last piece the story needed before it could be written down in full.',
      ],
      links: [
        { label: 'Trick Dictionary', href: '/freestyle/tricks' },
        { label: 'Glossary', href: '/freestyle/glossary' },
      ],
    },
    {
      id: 'this-encyclopedia',
      heading: 'This encyclopedia is the latest step',
      paragraphs: [
        'Seen this way, the history of freestyle is a single arc. A handful of tricks could be passed on by demonstration. A larger vocabulary needed consistent names. An exploding vocabulary needed a structural notation, and Ben Job\'s 1995 paper offered one of the first comprehensive frameworks for it. A written vocabulary could then be classified into families and operators. And a classified vocabulary could finally be gathered into a dictionary, and then an encyclopedia.',
        'This encyclopedia is the latest step in that evolution. Ben Job showed that tricks could be described structurally; this encyclopedia extends that foundation by organizing those structures into a coherent movement language, linking tricks through families, operators, notation, and relationships so the vocabulary can be explored rather than simply catalogued. It preserves and explains the language that four decades of players collectively created: every trick in it is a word someone added, and every player who reads it inherits the whole vocabulary.',
      ],
    },
  ],
  references: [
    { label: 'Footbag Hall of Fame', href: '/hof' },
    { label: 'Big Add Posse', href: '/bap' },
    { label: 'Competition', href: '/freestyle/competition' },
    { label: 'Insights', href: '/freestyle/insights' },
    { label: 'Records', href: '/freestyle/records' },
  ],
  whereNext: [
    { label: 'Start with six beginner lessons', href: '/freestyle/learn' },
    { label: 'Browse the Trick Dictionary', href: '/freestyle/tricks' },
    { label: 'The Glossary', href: '/freestyle/glossary' },
  ],
};
