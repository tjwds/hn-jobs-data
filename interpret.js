import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const logResults = async () => {
  const results = [];
  const posts = await prisma.whosHiring.findMany({});

  await Promise.all(
    posts.map(
      (post) =>
        new Promise(async (resolve) => {
          const oneDayLater = new Date(
            Number(post.createdAt) + 1000 * 60 * 60 * 24
          );
          const oneDayCommentsCount = await prisma.comment.count({
            where: {
              parent: post,
              createdAt: {
                lt: oneDayLater,
              },
              NOT: [
                {
                  content: {
                    equals: null,
                  },
                },
                {
                  content: {
                    equals: "",
                  },
                },
              ],
            },
          });
          const threeDaysLater = new Date(
            Number(post.createdAt) + 1000 * 60 * 60 * 24 * 3
          );
          const threeDayCommentsCount = await prisma.comment.count({
            where: {
              parent: post,
              createdAt: {
                lt: threeDaysLater,
              },
              NOT: [
                {
                  content: {
                    equals: null,
                  },
                },
                {
                  content: {
                    equals: "",
                  },
                },
              ],
            },
          });
          if (threeDayCommentsCount) {
            results.push({
              createdAt: post.createdAt,
              oneDayCommentsCount,
              threeDayCommentsCount,
            });
          }
          resolve();
        })
    )
  );
  results
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((post) => {
      console.log(
        `"${post.createdAt.toLocaleString()}", ${post.oneDayCommentsCount}, ${
          post.threeDayCommentsCount
        }`
      );
    });
};

logResults();
