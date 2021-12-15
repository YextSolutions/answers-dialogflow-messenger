// index.js
"use strict";

const functions = require("firebase-functions");
const { WebhookClient, Payload } = require("dialogflow-fulfillment");

process.env.DEBUG = "dialogflow:debug"; // enables lib debugging statements

const { provideCore } = require("@yext/answers-core");

const dotenv = require("dotenv");
dotenv.config();

const core = provideCore({
  apiKey: process.env.ANSWERS_API_KEY, // Replace with your Answers API Key
  experienceKey: "seaglass-chat", // Replace with your Answers Experience Key
  locale: "en",
  experienceVersion: "PRODUCTION",
  // Sandbox endpoints need to be specified when using sandbox account
  endpoints: {
    universalSearch:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/answers/query?someparam=blah",
    verticalSearch:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/answers/vertical/query",
    questionSubmission:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/createQuestion",
    status: "https://answersstatus.pagescdn.com",
    universalAutocomplete:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/answers/autocomplete",
    verticalAutocomplete:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/answers/vertical/autocomplete",
    filterSearch:
      "https://liveapi-sandbox.yext.com/v2/accounts/me/answers/filtersearch",
  },
});

const fallbackMessage = "Sorry! I don't have an answer for that :(";
const noGlasses =
  "Sorry! We don't have any glasses available with those specs :(";

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
  (request, response) => {
    const agent = new WebhookClient({ request, response });

    // Printing out the details from the request can help with debugging
    console.log(
      "Dialogflow Request headers: " + JSON.stringify(request.headers)
    );
    console.log("Dialogflow Request body: " + JSON.stringify(request.body));

    const intentMap = new Map();
    const options = { sendAsMessage: true, rawPayload: true };
    const query = request.body.queryResult.queryText;
    let answer = () => {};

    core
      .universalSearch({ query })
      .then((results) => {
        // extract the vertical key from the response
        const verticalKey =
          results && results.verticalResults[0]
            ? results.verticalResults[0].verticalKey
            : "";

        if (results.directAnswer) {
          // If there is a Direct Answer, we will highlight the value of the answer and also return the snippet it came from
          answer = () => {
            const payloadData = {
              richContent: [
                [
                  {
                    type: "info",
                    title: results.directAnswer.value,
                    subtitle: results.directAnswer.snippet.value,
                  },
                ],
              ],
            };
            agent.add(
              new Payload("PLATFORM_UNSPECIFIED", payloadData, options)
            );
          };
        } else if (verticalKey === "faqs") {
          // if the top result is a FAQ, we will return the answer as plain text
          answer = () =>
            agent.add(results.verticalResults[0].results[0].rawData.answer);
        } else if (verticalKey === "help_articles") {
          // if the top result is Help Article, we will provide the title and a link to the article
          answer = () => {
            const payloadData = {
              richContent: [
                [
                  {
                    type: "info",
                    title: results.verticalResults[0].results[0].name,
                    subtitle:
                      results.verticalResults[0].results[0].rawData.s_snippet,
                  },
                  {
                    type: "chips",
                    options: [
                      {
                        text: "Link to Article",
                        link: results.verticalResults[0].results[0].rawData
                          .landingPageUrl,
                      },
                    ],
                  },
                ],
              ],
            };
            agent.add(
              new Payload("PLATFORM_UNSPECIFIED", payloadData, options)
            );
          };
        } else if (verticalKey === "products") {
          if (results.verticalResults[0].results) {
            // if results are returned, loop through and format the top 3 products for showing in the chat
            const richContent = results.verticalResults[0].results
              .slice(0, 3)
              .map((product) => [
                {
                  type: "image",
                  rawUrl:
                    product.rawData.photoGallery[
                      product.rawData.photoGallery.length - 1
                    ].image.url,
                  accessibilityText: product.name,
                },
                {
                  type: "info",
                  title: product.name,
                  subtitle: `$${product.rawData.c_price}`,
                },
              ]);
            agent.add(
              new Payload("PLATFORM_UNSPECIFIED", { richContent }, options)
            );
          } else {
            // if the vertical was identified as being a product but no products matched the query, return a default message
            answer = () => agent.add(noGlasses);
          }
        } else {
          console.log("Vertical not handled");
          answer = () => agent.add(fallbackMessage);
        }
      })
      .catch((err) => {
        answer = () => agent.add(fallbackMessage);
        console.log(err.message);
      })
      .finally(() => {
        intentMap.set("Default Fallback Intent", answer);
        agent.handleRequest(intentMap);
      });
  }
);
