"use strict";

const functions = require("firebase-functions");
const { WebhookClient } = require("dialogflow-fulfillment");
const { Card, Suggestion } = require("dialogflow-fulfillment");

process.env.DEBUG = "dialogflow:debug"; // enables lib debugging statements

const { provideCore } = require("@yext/answers-core");

const dotenv = require("dotenv");
dotenv.config();

const core = provideCore({
  apiKey: process.env.ANSWERS_API_KEY,
  experienceKey: "seaglass-chat",
  locale: "en",
  experienceVersion: "PRODUCTION",
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

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
  (request, response) => {
    const agent = new WebhookClient({ request, response });
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
        const verticalKey =
          results && results.verticalResults[0]
            ? results.verticalResults[0].verticalKey
            : "";
        console.log("Vertical Key: " + verticalKey);

        if (results.directAnswer) {
          // If there is a Direct Answer, we will highlight value of the answer and also return the snippet it came from
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
          console.log(verticalResults[0].results[0].rawData);
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
                ],
              ],
            };
            agent.add(
              new Payload("PLATFORM_UNSPECIFIED", payloadData, options)
            );
          };
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
        console.log("responding");
        intentMap.set("Default Fallback Intent", answer);
        agent.handleRequest(intentMap);
      });
  }
);
