/**
 * The freestyle History page as a single coherent article: how freestyle evolved from a
 * handful of tricks into a movement language with names, notation, classification, and this
 * encyclopedia. Organized entirely around one thesis (each generation expanded the shared
 * vocabulary), with the encyclopedia's own pages as the factual foundation: Competition
 * numbers are woven in as evidence, the Hall of Fame and BAP are integrated as the
 * recognition institutions, and the dictionary and glossary are where the language is
 * organized. The credits for the sport's people live here, in the prose, rather than on page
 * after page. Rendered on a public surface, so the prose carries no em dashes and states only
 * what our own pages and settled record support; uncertain dates and inventors are omitted or
 * stated at a higher level.
 */

export interface HistoryLink {
  label:    string;
  href:     string;
  external?: boolean;
}

/** A link to a family's page, named by family: the service links it only while
 *  that family has a page, and leaves it out otherwise. */
export interface HistoryFamilyLink {
  label:      string;
  familySlug: string;
}

export interface HistorySection<L = HistoryLink | HistoryFamilyLink> {
  id:         string;
  heading:    string;
  paragraphs: readonly string[];
  links?:     readonly L[];
}

/** The narrative as authored; its section links may name a family. */
export interface HistoryNarrativeSource {
  thesis:     string;
  intro:      readonly string[];
  sections:   readonly HistorySection[];
  whereNext:  readonly HistoryLink[];
}

/** The narrative as rendered: every link resolved to an href. */
export interface HistoryNarrative extends Omit<HistoryNarrativeSource, 'sections'> {
  sections: readonly HistorySection<HistoryLink>[];
}

export const HISTORY_NARRATIVE: HistoryNarrativeSource = {
  thesis:
    'Freestyle did not become more difficult simply because players got better. It evolved because each generation introduced new ideas that expanded the shared vocabulary available to everyone who followed.',
  intro: [
    'Freestyle footbag is a language. What began as a handful of ways to keep a small bag in the air grew, over four decades, into a vocabulary of hundreds of named tricks, a notation for writing them down, and a system for organizing them into families.',
  ],
  sections: [
    {
      id: 'origins',
      heading: 'A handful of tricks',
      paragraphs: [
        'Footbag began in Oregon in the early 1970s, when Mike Marshall and John Stalberger started kicking a small bag to keep it in the air using only the feet and legs. Out of that simple game grew several disciplines, and one of them, freestyle, was about tricks: stalls, dexterities, and the ways to link them.',
        'In the early years the vocabulary was small enough that a dedicated player could learn most of what was known, then set about adding to it. Almost everything that came later grew out of that first small set of moves.',
      ],
      links: [
        { label: 'Footbag Hall of Fame', href: '/hof' },
      ],
    },
    {
      id: 'competition',
      heading: 'Competition spread new ideas',
      paragraphs: [
        'Once footbag organized into contests, freestyle had somewhere to grow in public. A trick that scored well, or that no one else could do, spread the moment it was performed in front of other players.',
        'It also widened the pool of people doing the discovering. The documented event record grew from a couple of dozen contests in freestyle\'s first decade to well over a hundred at its peak, and the field turned international along the way. The most decorated freestyle competitor on record, Vaclav Klouda of the Czech Republic, sits alongside champions from Switzerland, Poland, and the United States.',
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
        'The clearest sign that freestyle grew as a language is how the tricks multiplied. They multiplied by composition: a small set of operators, ways of modifying a trick, layered onto a small set of base movements.',
        'A single operator can generate a whole family of tricks. In the dictionary today, the most productive operators, symposium, ducking, spinning, and paradox, each appear on roughly eighty to a hundred and ten different tricks. Learn the operator once, and every base it touches becomes a new trick you can name.',
        'By roughly 2007 to 2008, much of the modern vocabulary and the compositional system behind it had matured. New tricks and new ideas have kept appearing since, alongside new combinations of the moves that already existed.',
      ],
      links: [
        { label: 'Operators', href: '/freestyle/operators' },
        { label: 'Freestyle Concepts', href: '/freestyle/concepts' },
      ],
    },
    {
      id: 'structure',
      heading: 'Some tricks became the structure of the language',
      paragraphs: [
        'Not every trick carries equal weight. As the vocabulary grew, a few movements became its structure, the points that everything else connects through. In a documented archive of competitive sequences, one trick stands apart: the whirl. It is the most-used trick in the record by a wide margin, and it is also the most connected, linking to more different tricks than anything else.',
        'The whirl became central not because it is flashy but because it returns a player to a reusable position, so a combination can keep going.',
      ],
      links: [
        { label: 'Whirl', familySlug: 'whirl' },
      ],
    },
    {
      id: 'difficulty',
      heading: 'Difficulty became a moving ceiling',
      paragraphs: [
        'Freestyle traditionally counts recognized trick components in ADD; combinations with more counted components receive higher ADD totals, though equal ADD does not imply equal execution difficulty.',
        'Each generation pushed the ceiling higher, and it could only rise because the vocabulary underneath it kept expanding. A single new modifier could lift the whole scale: when blurry, which adds a fast rotation to tricks players already knew, came into the vocabulary, it raised the top of the difficulty curve, and runs in which every trick cleared a high ADD threshold became the new mark of a top performance. Difficulty is not separate from the language; it is the language getting richer, measured.',
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
        'In 1995 a paper shared with the footbag community, titled "By the Way, Not the Name," proposed a way past this. Instead of identifying a trick by its name, it described the trick by its structure: a set, a series of movements, and a catch, written as a formula. Mirage stopped being only a name and became a form you could read on the page.',
      ],
      links: [
        { label: 'Ben Job\'s 1995 Notation Paper', href: '/freestyle/notation-article' },
        { label: 'How Trick Names Work', href: '/freestyle/concepts#section-notation' },
      ],
    },
    {
      id: 'institutions',
      heading: 'Institutions preserved and spread the language',
      paragraphs: [
        'Innovation only matters to a sport if it becomes shared, and that took institutions. Two of them exist to recognize it. The Footbag Hall of Fame, founded in the 1990s by the sport\'s early pioneers, honors the players, champions, and promoters who turned a back-yard game into a global one. The Big Add Posse, named after the ADD difficulty metric itself, is an invite-only circle you enter only by shredding at the frontier, so it recognizes exactly the players who expand what is possible.',
        'Other institutions preserved and spread the knowledge. Footbag World, the print magazine and catalog of the sport\'s early decades, carried news, how-to, and results between players and pushed footbag into the mainstream. Later, footbag.org gathered the community and its move lists online, and more recently video channels such as PassBack have taught and named tricks for a new generation.',
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
      ],
      links: [
        { label: 'Trick Dictionary', href: '/freestyle/tricks' },
        { label: 'Freestyle Concepts', href: '/freestyle/concepts' },
      ],
    },
    {
      id: 'this-encyclopedia',
      heading: 'This encyclopedia is the latest step',
      paragraphs: [
        'This encyclopedia is the latest step in that evolution. The 1995 notation showed that tricks could be described structurally; this encyclopedia extends that foundation by organizing those structures into a coherent movement language, linking tricks through families, operators, notation, and relationships so the vocabulary can be explored rather than simply catalogued. It preserves and explains the language that four decades of players collectively created: every trick in it is a word someone added, and every player who reads it inherits the whole vocabulary.',
      ],
    },
  ],
  whereNext: [
    { label: 'Start With the Six Vocabulary Lessons', href: '/freestyle/start#next-steps' },
    { label: 'Browse the Trick Dictionary', href: '/freestyle/tricks' },
    // Learning intent lands on the explanatory reference (Freestyle
    // Concepts); the Glossary stays as the term-lookup destination.
    { label: 'Freestyle Concepts', href: '/freestyle/concepts' },
    { label: 'The Glossary', href: '/freestyle/glossary' },
  ],
};
