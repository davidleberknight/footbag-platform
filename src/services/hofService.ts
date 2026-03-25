import { BADFLAGS } from "dns";

interface HofSection {
  heading: string;
  paragraphs: string[];
}

interface HofLandingPage {
  page: {
    sectionKey: string;
    pageKey: string;
    title: string;
    intro: string;
    externalLink: { href: string; label: string };
  };
  content: {
    sections: HofSection[];
  };
}

export const hofService = {
  getHofLandingPage(): HofLandingPage {
    return {
      page: {
        sectionKey: 'hof',
        pageKey: 'hof_index',
        title: 'Footbag Hall of Fame',
        intro: 'Honouring the pioneers, champions, and promoters of footbag sports.',
        externalLink: { href: 'https://www.footbaghalloffame.net/', label: 'Visit FootbagHallOfFame.net' },
      },
      content: {
        sections: [
          {
            heading: 'A Bit of History...',
            paragraphs: [
              'One fine day in Oregon in 1972, Mike Marshall and John Stalberger decided to hack a sack, ' +
              'to kick a small bag around for fun and exercise. ' +
              'This became Hacky Sack brand footbag, and soon there were competitions, ' +
              'plus joyful free-flow kicking at festivals and events. ' +
              'The Footbag Hall of Fame was founded in 1997 by Stalberger and fellow pioneers ' +
              'to honour the champions and promoters who left their mark, turning this back-yard game into a global phenomenon. ' +
              'Maybe some day you can become a HoF member too! Get involved, join a club, go to tournaments, ' +
              'and most of all, have fun! Go get a hack with a sack. The most fun wins. ' +
              'Well, sometimes Kenny Shults still wins! #BringBackTheHack',
            ],
          },
        ],
      },
    };
  },
};
