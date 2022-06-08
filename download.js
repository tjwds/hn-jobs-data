import { PrismaClient } from "@prisma/client";

import { whoIsHiringList } from "./whoIsHiringList.js";

const prisma = new PrismaClient();

const stages = {
  POPULATE_WHOS_HIRING: 0,
  REQUEST_WHOS_HIRING: 1, // (which is effectively also POPULATE_COMMENTS)
  REQUEST_COMMENTS: 2,
};

let stage = stages.POPULATE_WHOS_HIRING;
// "There is currently no rate limit." …hmm.
let lastApiRequestMadeAt = 0;

const wait = (seconds) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(), seconds * 1000);
  });

// returns true if there's another tick
const nextTick = async () => {
  let idToFetch;
  // find the next action to do
  if (stage === stages.POPULATE_WHOS_HIRING) {
    const countHiring = await prisma.whosHiring.count();
    if (countHiring === Object.values(whoIsHiringList).length) {
      console.log("WhosHiring request database fully populated.");
      stage = stages.REQUEST_WHOS_HIRING;
    } else {
      console.log(
        `Need to populate list, ${countHiring} of ${
          Object.keys(whoIsHiringList).length
        } exist.`
      );
    }
  }
  if (stage === stages.REQUEST_WHOS_HIRING) {
    const nextToFetch = await prisma.whosHiring.findFirst({
      where: { fullyFetched: false },
    });
    if (!nextToFetch) {
      console.log("WhosHiring requests completed.");
      stage = stages.REQUEST_COMMENTS;
    } else {
      idToFetch = nextToFetch.id;
    }
  }
  if (stage === stages.REQUEST_COMMENTS) {
    const nextToFetch = await prisma.comment.findFirst({
      where: { fullyFetched: false },
    });
    if (!nextToFetch) {
      console.log("Comment requests completed. All done!");
      return false;
    } else {
      idToFetch = nextToFetch.id;
    }
  }
  // chain of if statements, instead of else if

  // ---
  // do it, await result
  if (stage === stages.POPULATE_WHOS_HIRING) {
    console.log("Let's start!  Populating db of threads…");
    // What a mess.  prisma doesn't support createMany in sqlite! and we can't
    // make too many connections at once!
    for (const id of Object.values(whoIsHiringList)) {
      try {
        await prisma.whosHiring.create({
          data: { id },
        });
      } catch (err) {}
    }
    console.log("Populated WhosHiring db.");
  } else if (stage === stages.REQUEST_WHOS_HIRING) {

    const request = await fetch(
      `https://hacker-news.firebaseio.com/v0/item/${idToFetch}.json`
    );

    lastApiRequestMadeAt = new Date();
    try {
      const data = await request.json();
      const { kids, title } = data;
      const createdAt = new Date(data.time * 1000);

      if (!kids || !title || !createdAt) {
        // uh oh.
        console.log(`Failed to request ${idToFetch}.`);
        return true;
      }

      await prisma.whosHiring.update({
        where: { id: idToFetch },
        data: {
          fullyFetched: true,
          createdAt,
          title,
        },
      });

      // see above
      for (const numId of kids) {
        const id = String(numId);
        await prisma.comment.upsert({
          where: { id },
          update: {},
          create: { parentId: idToFetch, id },
        });
      }

      console.log(`Got Who Is Hiring thread ${idToFetch}`);
    } catch (err) {
      // …uh oh.  try again?
      console.log(err);
      console.log(`Failed to request ${idToFetch}.`);
      return true;
    }
  } else if (stage === stages.REQUEST_COMMENTS) {
    if (new Date() - lastApiRequestMadeAt < 1000) {
      await wait(1);
    }

    const request = await fetch(
      `https://hacker-news.firebaseio.com/v0/item/${idToFetch}.json`
    );

    lastApiRequestMadeAt = new Date();
    try {
      const data = await request.json();
      const { text, deleted } = data;
      const createdAt = new Date(data.time * 1000);
      if (deleted) {
        await prisma.comment.update({
          where: { id: idToFetch },
          data: {
            fullyFetched: true,
            createdAt,
          },
        });
        console.log(`Got comment ${idToFetch}, which had been deleted`);
        return true;
      }

      await prisma.comment.update({
        where: { id: idToFetch },
        data: {
          fullyFetched: true,
          createdAt,
          content: text,
        },
      });

      console.log(`Got comment ${idToFetch}`);
    } catch (err) {
      console.log(err);
      // …uh oh.  try again?
      console.log(`Failed to request ${idToFetch}.`);
      return true;
    }
  }

  // my kingdom for tail recursion…
  return true;
};

const run = async () => {
  while (true) {
    if (!(await nextTick())) {
      break;
    }
  }
};

run();
