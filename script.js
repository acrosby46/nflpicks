// =====================================
// NFL PICK ASSISTANT
// =====================================


// API endpoint
const API_BASE_URL =
    "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";


// HTML elements
const apiKeyInput =
    document.getElementById("apiKey");

const loadOddsButton =
    document.getElementById("loadOddsButton");

const resultsContainer =
    document.getElementById("results");

const statusContainer =
    document.getElementById("status");


// =====================================
// BUTTON CLICK
// =====================================

loadOddsButton.addEventListener(
    "click",
    loadOdds
);


// =====================================
// LOAD ODDS
// =====================================

async function loadOdds() {

    const apiKey =
        apiKeyInput.value.trim();


    // Check API key
    if (!apiKey) {

        showStatus(
            "Please enter your API key.",
            "error"
        );

        return;
    }


    // Clear previous results
    resultsContainer.innerHTML = "";


    showStatus(
        "Loading NFL odds...",
        "loading"
    );


    loadOddsButton.disabled = true;

    loadOddsButton.textContent =
        "Loading...";


    try {

        // Build API URL
        const url =
            `${API_BASE_URL}` +
            `?apiKey=${encodeURIComponent(apiKey)}` +
            `&regions=us` +
            `&markets=h2h` +
            `&oddsFormat=american`;


        // Fetch odds
        const response =
            await fetch(url);


        // Handle API errors
        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `API error: ${response.status} ${errorText}`
            );

        }


        // Convert response to JSON
        const games =
            await response.json();


        // Display results
        displayGames(games);


        showStatus(
            `Loaded ${games.length} games.`,
            ""
        );


    }

    catch (error) {

        console.error(error);


        showStatus(
            "Could not load odds. Check your API key and try again.",
            "error"
        );

    }


    finally {

        loadOddsButton.disabled = false;

        loadOddsButton.textContent =
            "Get NFL Odds";

    }

}


// =====================================
// DISPLAY GAMES
// =====================================

function displayGames(games) {

    if (!games || games.length === 0) {

        resultsContainer.innerHTML =
            "<p>No upcoming NFL games were returned.</p>";

        return;
    }


    games.forEach(game => {

        const result =
            calculateConsensus(game);


        // Skip games with no usable odds
        if (!result) {
            return;
        }


        const gameCard =
            createGameCard(
                game,
                result
            );


        resultsContainer.appendChild(
            gameCard
        );

    });

}


// =====================================
// CALCULATE CONSENSUS
// =====================================

function calculateConsensus(game) {

    const homeTeam =
        game.home_team;

    const awayTeam =
        game.away_team;


    const homeProbabilities = [];

    const awayProbabilities = [];


    // Go through every sportsbook
    game.bookmakers.forEach(bookmaker => {

        // Find moneyline market
        const h2hMarket =
            bookmaker.markets.find(
                market => market.key === "h2h"
            );


        if (!h2hMarket) {
            return;
        }


        // Find both teams
        const homeOutcome =
            h2hMarket.outcomes.find(
                outcome =>
                    outcome.name === homeTeam
            );

        const awayOutcome =
            h2hMarket.outcomes.find(
                outcome =>
                    outcome.name === awayTeam
            );


        if (!homeOutcome || !awayOutcome) {
            return;
        }


        // Convert American odds to probabilities
        const homeRawProbability =
            americanOddsToProbability(
                homeOutcome.price
            );

        const awayRawProbability =
            americanOddsToProbability(
                awayOutcome.price
            );


        // Remove vig by normalizing probabilities
        const total =
            homeRawProbability +
            awayRawProbability;


        const homeFairProbability =
            homeRawProbability / total;

        const awayFairProbability =
            awayRawProbability / total;


        homeProbabilities.push(
            homeFairProbability
        );

        awayProbabilities.push(
            awayFairProbability
        );

    });


    // No sportsbook data
    if (
        homeProbabilities.length === 0 ||
        awayProbabilities.length === 0
    ) {
        return null;
    }


    // Use MEDIAN instead of average
    // This reduces the impact of outliers
    const homeProbability =
        median(homeProbabilities);

    const awayProbability =
        median(awayProbabilities);


    // Pick winner
    let recommendedTeam;
    let confidence;


    if (
        homeProbability >
        awayProbability
    ) {

        recommendedTeam =
            homeTeam;

        confidence =
            homeProbability;

    } else {

        recommendedTeam =
            awayTeam;

        confidence =
            awayProbability;

    }


    return {

        homeProbability,

        awayProbability,

        recommendedTeam,

        confidence,

        sportsbookCount:
            homeProbabilities.length

    };

}


// =====================================
// AMERICAN ODDS → PROBABILITY
// =====================================

function americanOddsToProbability(odds) {

    if (odds < 0) {

        return (
            Math.abs(odds) /
            (
                Math.abs(odds) +
                100
            )
        );

    }


    return (
        100 /
        (
            odds +
            100
        )
    );

}


// =====================================
// MEDIAN
// =====================================

function median(numbers) {

    const sorted =
        [...numbers].sort(
            (a, b) => a - b
        );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    // Odd number
    if (
        sorted.length % 2 !== 0
    ) {

        return sorted[middle];

    }


    // Even number
    return (
        sorted[middle - 1] +
        sorted[middle]
    ) / 2;

}


// =====================================
// CREATE GAME CARD
// =====================================

function createGameCard(
    game,
    result
) {

    const card =
        document.createElement("article");


    card.className =
        "game-card";


    // Format game date
    const gameDate =
        new Date(
            game.commence_time
        );


    const formattedDate =
        gameDate.toLocaleString(
            "en-US",
            {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
            }
        );


    card.innerHTML = `

        <div class="game-date">
            ${formattedDate}
        </div>


        <div class="matchup">

            <div class="team">

                <div class="team-name">
                    ${game.away_team}
                </div>

                <div class="probability">
                    ${formatPercent(
                        result.awayProbability
                    )}
                </div>

            </div>


            <div class="vs">
                VS
            </div>


            <div class="team">

                <div class="team-name">
                    ${game.home_team}
                </div>

                <div class="probability">
                    ${formatPercent(
                        result.homeProbability
                    )}
                </div>

            </div>

        </div>


        <div class="recommendation">

            Recommendation:

            <br>

            <strong>
                ${result.recommendedTeam}
            </strong>

            <br>

            ${formatPercent(
                result.confidence
            )}
                estimated win probability

        </div>


        <div class="details">

            Based on
            ${result.sportsbookCount}
            sportsbooks

        </div>

    `;


    return card;

}


// =====================================
// FORMAT PERCENTAGE
// =====================================

function formatPercent(probability) {

    return (
        probability * 100
    ).toFixed(1) + "%";

}


// =====================================
// STATUS MESSAGE
// =====================================

function showStatus(
    message,
    type
) {

    statusContainer.textContent =
        message;


    statusContainer.className =
        type;

}