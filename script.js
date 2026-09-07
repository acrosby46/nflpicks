const API_URL =
    "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";

let allGames = [];
let currentPicks = [];
let oddsLoaded = false;


/*
 * NFL week date ranges.
 *
 * These are calendar dates, not API queries.
 * They are used only to filter the games returned by the API.
 */
const NFL_WEEKS = {
    "1": {
        name: "Week 1",
        start: "2026-09-06",
        end: "2026-09-15"
    },
    "2": {
        name: "Week 2",
        start: "2026-09-16",
        end: "2026-09-22"
    },
    "3": {
        name: "Week 3",
        start: "2026-09-23",
        end: "2026-09-29"
    },
    "4": {
        name: "Week 4",
        start: "2026-09-30",
        end: "2026-10-06"
    },
    "5": {
        name: "Week 5",
        start: "2026-10-07",
        end: "2026-10-13"
    },
    "6": {
        name: "Week 6",
        start: "2026-10-14",
        end: "2026-10-20"
    },
    "7": {
        name: "Week 7",
        start: "2026-10-21",
        end: "2026-10-27"
    },
    "8": {
        name: "Week 8",
        start: "2026-10-28",
        end: "2026-11-03"
    },
    "9": {
        name: "Week 9",
        start: "2026-11-04",
        end: "2026-11-10"
    },
    "10": {
        name: "Week 10",
        start: "2026-11-11",
        end: "2026-11-17"
    },
    "11": {
        name: "Week 11",
        start: "2026-11-18",
        end: "2026-11-24"
    },
    "12": {
        name: "Week 12",
        start: "2026-11-25",
        end: "2026-12-01"
    },
    "13": {
        name: "Week 13",
        start: "2026-12-02",
        end: "2026-12-08"
    },
    "14": {
        name: "Week 14",
        start: "2026-12-09",
        end: "2026-12-15"
    },
    "15": {
        name: "Week 15",
        start: "2026-12-16",
        end: "2026-12-22"
    },
    "16": {
        name: "Week 16",
        start: "2026-12-23",
        end: "2026-12-29"
    },
    "17": {
        name: "Week 17",
        start: "2026-12-30",
        end: "2027-01-05"
    },
    "18": {
        name: "Week 18",
        start: "2027-01-06",
        end: "2027-01-12"
    },
    "wildcard": {
        name: "WildCard",
        start: "2027-01-13",
        end: "2027-01-19"
    },
    "divisional": {
        name: "Div Rd",
        start: "2027-01-20",
        end: "2027-01-26"
    },
    "conference": {
        name: "Conf Champ",
        start: "2027-01-27",
        end: "2027-02-02"
    },
    "pro-bowl": {
        name: "Pro Bowl",
        start: "2027-02-03",
        end: "2027-02-09"
    },
    "super-bowl": {
        name: "Super Bowl",
        start: "2027-02-10",
        end: "2027-02-15"
    }
};


/*
 * Convert American odds to implied probability.
 */
function americanToImpliedProbability(odds) {
    const numericOdds = Number(odds);

    if (!Number.isFinite(numericOdds)) {
        return null;
    }

    if (numericOdds > 0) {
        return 100 / (numericOdds + 100);
    }

    return Math.abs(numericOdds) / (Math.abs(numericOdds) + 100);
}


/*
 * Return the median value in an array.
 */
function median(values) {
    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}


/*
 * Calculate the consensus pick for one game.
 *
 * Each sportsbook's two-way h2h probabilities are normalized
 * to remove the sportsbook's vig.
 *
 * The median probability across sportsbooks is then used as
 * the consensus probability.
 */
function calculateGamePick(game) {
    const teamProbabilities = {};

    for (const bookmaker of game.bookmakers || []) {

        const h2hMarket = (bookmaker.markets || []).find(
            market => market.key === "h2h"
        );

        if (!h2hMarket || !h2hMarket.outcomes) {
            continue;
        }

        const outcomes = h2hMarket.outcomes;

        if (outcomes.length !== 2) {
            continue;
        }

        const first = outcomes[0];
        const second = outcomes[1];

        const firstProbability =
            americanToImpliedProbability(first.price);

        const secondProbability =
            americanToImpliedProbability(second.price);

        if (
            firstProbability === null ||
            secondProbability === null
        ) {
            continue;
        }

        const totalProbability =
            firstProbability + secondProbability;

        if (totalProbability <= 0) {
            continue;
        }

        const normalizedFirst =
            firstProbability / totalProbability;

        const normalizedSecond =
            secondProbability / totalProbability;

        if (!teamProbabilities[first.name]) {
            teamProbabilities[first.name] = [];
        }

        if (!teamProbabilities[second.name]) {
            teamProbabilities[second.name] = [];
        }

        teamProbabilities[first.name].push(normalizedFirst);
        teamProbabilities[second.name].push(normalizedSecond);
    }

    const teams = Object.keys(teamProbabilities);

    if (teams.length < 2) {
        return null;
    }

    const consensus = teams.map(team => ({
        team,
        probability: median(teamProbabilities[team]),
        bookmakers: teamProbabilities[team].length
    }));

    consensus.sort((a, b) => b.probability - a.probability);

    const winner = consensus[0];

    return {
        winner: winner.team,
        probability: winner.probability,
        bookmakers: winner.bookmakers
    };
}


/*
 * Convert an API date/time into an Eastern calendar date.
 *
 * Using Intl with America/New_York handles daylight saving time
 * automatically.
 */
function dateOnlyInEastern(isoDate) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date(isoDate));
}


/*
 * Format a game date/time for display.
 */
function formatGameDate(isoDate) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(isoDate));
}


/*
 * Update the date range shown beneath the week selector.
 */
function updateWeekDateDisplay() {
    const selectedWeek =
        document.getElementById("weekSelect").value;

    const week = NFL_WEEKS[selectedWeek];

    if (!week) {
        return;
    }

    const start = new Date(`${week.start}T12:00:00`);
    const end = new Date(`${week.end}T12:00:00`);

    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });

    document.getElementById("weekDates").textContent =
        `${formatter.format(start)} – ${formatter.format(end)}`;
}


/*
 * Filter the already-downloaded odds by the selected week.
 *
 * IMPORTANT:
 * This function does NOT make an API request.
 */
function filterByWeek() {
    if (!oddsLoaded) {
        return;
    }

    const selectedWeek =
        document.getElementById("weekSelect").value;

    const week = NFL_WEEKS[selectedWeek];

    if (!week) {
        return;
    }

    const filteredGames = allGames.filter(game => {

        if (!game.commence_time) {
            return false;
        }

        const gameDate =
            dateOnlyInEastern(game.commence_time);

        return (
            gameDate >= week.start &&
            gameDate <= week.end
        );
    });

    renderResults(filteredGames, week);
}


/*
 * Render the selected week's picks.
 */
function renderResults(games, week) {

    const results = document.getElementById("results");
    const resultsTitle =
        document.getElementById("resultsTitle");
    const resultsSubtitle =
        document.getElementById("resultsSubtitle");

    currentPicks = [];

    resultsTitle.textContent = `${week.name} Picks`;

    resultsSubtitle.textContent =
        `${week.start} through ${week.end}`;

    if (!games.length) {

        results.innerHTML = `
            <div class="no-games">
                <strong>No games currently available for ${week.name}.</strong>
                <p>
                    The Odds API has not returned any NFL games in this
                    week's date range. This is normal for weeks that have
                    not yet been posted by sportsbooks, or for completed
                    games that are no longer available from the odds endpoint.
                </p>
            </div>
        `;

        document.getElementById("copyPicksButton").disabled = true;
        return;
    }

    const gamesWithPicks = games
        .map(game => ({
            game,
            pick: calculateGamePick(game)
        }))
        .filter(item => item.pick !== null)
        .sort(
            (a, b) =>
                new Date(a.game.commence_time) -
                new Date(b.game.commence_time)
        );

    if (!gamesWithPicks.length) {

        results.innerHTML = `
            <div class="no-games">
                <strong>Games were found, but no usable h2h odds were available.</strong>
                <p>
                    Try fetching the latest odds again later.
                </p>
            </div>
        `;

        document.getElementById("copyPicksButton").disabled = true;
        return;
    }

    currentPicks = gamesWithPicks.map(item => ({
        game: item.game,
        pick: item.pick
    }));

    let html = `
        <div class="table-wrap">
            <table class="picks-table">
                <thead>
                    <tr>
                        <th>Date / Time</th>
                        <th>Matchup</th>
                        <th>Pick</th>
                        <th>Win Probability</th>
                        <th>Sportsbooks</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const item of gamesWithPicks) {

        const game = item.game;
        const pick = item.pick;

        const awayTeam = game.away_team;
        const homeTeam = game.home_team;

        html += `
            <tr>
                <td class="date-cell">
                    ${formatGameDate(game.commence_time)}
                </td>

                <td class="matchup">
                    ${awayTeam} @ ${homeTeam}
                </td>

                <td class="pick">
                    ${pick.winner}
                </td>

                <td class="probability">
                    ${(pick.probability * 100).toFixed(1)}%
                </td>

                <td class="bookmaker-count">
                    ${pick.bookmakers}
                </td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    results.innerHTML = html;

    document.getElementById("copyPicksButton").disabled = false;
}


/*
 * Fetch the latest available NFL odds.
 *
 * This is the ONLY function that makes an API request.
 */
async function getOdds() {

    const apiKey =
        document.getElementById("apiKey").value.trim();

    const button =
        document.getElementById("getOddsButton");

    const status =
        document.getElementById("status");

    const quota =
        document.getElementById("quota");

    if (!apiKey) {
        status.textContent =
            "Please enter your The Odds API key.";

        status.className = "status error";
        return;
    }

    button.disabled = true;
    button.textContent = "Getting Odds...";

    status.textContent =
        "Fetching the latest NFL odds...";

    status.className = "status info";

    quota.textContent = "";

    try {

        const params = new URLSearchParams({
            apiKey: apiKey,
            regions: "us",
            markets: "h2h",
            oddsFormat: "american"
        });

        const response =
            await fetch(`${API_URL}?${params.toString()}`);

        const remaining =
            response.headers.get("x-requests-remaining");

        const used =
            response.headers.get("x-requests-used");

        if (remaining !== null) {
            quota.textContent =
                `API requests used: ${used ?? "?"} | Remaining: ${remaining}`;
        }

        if (!response.ok) {

            let errorMessage =
                `The Odds API returned HTTP ${response.status}.`;

            try {
                const errorData = await response.json();

                if (errorData.message) {
                    errorMessage += ` ${errorData.message}`;
                }
            } catch {
                // Ignore JSON parsing errors.
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error(
                "The API returned an unexpected response."
            );
        }

        allGames = data;
        oddsLoaded = true;

        document.getElementById("filterWeekButton").disabled = false;

        status.textContent =
            `Latest odds loaded successfully. ${data.length} game(s) are available.`;

        status.className = "status success";

        /*
         * Immediately show the currently selected week
         * using the newly downloaded data.
         */
        filterByWeek();

    } catch (error) {

        allGames = [];
        oddsLoaded = false;

        document.getElementById("filterWeekButton").disabled = true;
        document.getElementById("copyPicksButton").disabled = true;

        status.textContent =
            error.message || "Unable to retrieve NFL odds.";

        status.className = "status error";

    } finally {

        button.disabled = false;
        button.textContent = "Get Latest Odds";
    }
}


/*
 * Copy the currently displayed picks as HTML.
 *
 * The copied section can be pasted inside the
 * #picks-content div in latest-picks.html.
 */
async function copyPicks() {

    if (!currentPicks.length) {
        return;
    }

    const selectedWeek =
        document.getElementById("weekSelect").value;

    const week = NFL_WEEKS[selectedWeek];

    const publishedAt =
        new Date().toLocaleString("en-US", {
            timeZone: "America/New_York",
            dateStyle: "long",
            timeStyle: "short"
        });

    let html = `
<section class="published-picks">
    <h2>${week.name}</h2>
    <p class="published-date">
        Picks generated ${publishedAt} ET
    </p>

    <div class="table-wrap">
        <table class="picks-table">
            <thead>
                <tr>
                    <th>Date / Time</th>
                    <th>Matchup</th>
                    <th>Pick</th>
                    <th>Win Probability</th>
                    <th>Sportsbooks</th>
                </tr>
            </thead>
            <tbody>
`;

    for (const item of currentPicks) {

        const game = item.game;
        const pick = item.pick;

        html += `
                <tr>
                    <td class="date-cell">
                        ${formatGameDate(game.commence_time)}
                    </td>

                    <td class="matchup">
                        ${game.away_team} @ ${game.home_team}
                    </td>

                    <td class="pick">
                        ${pick.winner}
                    </td>

                    <td class="probability">
                        ${(pick.probability * 100).toFixed(1)}%
                    </td>

                    <td class="bookmaker-count">
                        ${pick.bookmakers}
                    </td>
                </tr>
`;
    }

    html += `
            </tbody>
        </table>
    </div>
</section>
`;

    try {

        await navigator.clipboard.writeText(html);

        document.getElementById("copyStatus").textContent =
            "Copied! Paste this HTML inside the #picks-content section of latest-picks.html.";

    } catch (error) {

        document.getElementById("copyStatus").textContent =
            "Unable to copy automatically. Your browser may be blocking clipboard access.";

    }
}


/*
 * Event handlers
 */

document
    .getElementById("getOddsButton")
    .addEventListener("click", getOdds);

document
    .getElementById("filterWeekButton")
    .addEventListener("click", filterByWeek);

document
    .getElementById("weekSelect")
    .addEventListener("change", updateWeekDateDisplay);

document
    .getElementById("copyPicksButton")
    .addEventListener("click", copyPicks);


/*
 * Initial UI setup.
 */
updateWeekDateDisplay();