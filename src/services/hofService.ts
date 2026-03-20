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
              'Mike Marshall and John Stalberger invented Hacky Sack in Oregon in 1972. This was the world\'s first footbag. From that small beginning, footbag became a competitive sport with clubs and tournaments around the globe. The Footbag Hall of Fame was founded in 1997 by Stalberger and fellow pioneers to honour the pioneers, champions, and promoters who left their mark on the sport. Maybe you can become a Hall of Fame member too! Get involved, join a club, go to tournaments, and most of all, have fun! The most fun wins. #BringBackTheHack',
            ],
          },
        ],
      },
    };
  },
};
