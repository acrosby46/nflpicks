const API_URL =
    "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";

const STORAGE_KEY = "nflPicksOdds";
const STORAGE_TIMESTAMP_KEY = "nflPicksOddsTimestamp";

let allGames = [];
let currentPicks = [];
let oddsLoaded = false;


/*
    NFL week date ranges.

    Dates are inclusive and are based on the 2026 NFL season.
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


function getElement(id) {
    return document.getElementById(id);
}


/*
    Convert American odds to raw implied probability.
*/
function americanToImpliedProbability(odds) {
    if (odds > 0) {
        return 100 / (odds + 100);
    }

    return Math.abs(odds) / (Math.abs(odds) + 100);
}


/*
    Calculate the median of an array.
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
    Calculate the consensus winner for a game.

    For every sportsbook:
    1. Convert both h2h prices to implied probabilities.
    2. Remove the sportsbook's vig by normalizing the two probabilities.
    3. Collect the probability for each team.
    4. Use the median across sportsbooks.
*/
function calculateGamePick(game) {
    const teamProbabilities = {};

    if (!game.bookmakers || !game.bookmakers.length) {
        return null;
    }

    game.bookmakers.forEach(bookmaker => {
        const market = bookmaker.markets?.find(
            marketItem => marketItem.key === "h2h"
        );

        if (!market || !market.outcomes || market.outcomes.length < 2) {
            return;
        }

        const outcomes = market.outcomes;

        const rawProbabilities = outcomes.map(outcome => ({
            name: outcome.name,
            probability: americanToImpliedProbability(outcome.price)
        }));

        const totalProbability = rawProbabilities.reduce(
            (sum, item) => sum + item.probability,
            0
        );

        rawProbabilities.forEach(item => {
            const normalizedProbability =
                item.probability / totalProbability;

            if (!teamProbabilities[item.name]) {
                teamProbabilities[item.name] = [];
            }

            teamProbabilities[item.name].push(normalizedProbability);
        });
    });

    const teams = Object.keys(teamProbabilities);

    if (teams.length < 2) {
        return null;
    }

    const consensus = teams.map(team => ({
        team,
        probability: median(teamProbabilities[team]),
        bookmakerCount: teamProbabilities[team].length
    }));

    consensus.sort((a, b) => b.probability - a.probability);

    const winner = consensus[0];
    const loser = consensus[1];

    if (!winner || !loser) {
        return null;
    }

    return {
        id: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        pick: winner.team,
        probability: winner.probability,
        probabilityPercent: winner.probability * 100,
        opposingProbability: loser.probability,
        bookmakerCount: winner.bookmakerCount
    };
}


/*
    Get the calendar date in Eastern Time.

    This avoids manually assuming either EST or EDT.
*/
function dateOnlyInEastern(isoString) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    return formatter.format(new Date(isoString));
}


/*
    Format the game date/time for display.
*/
function formatGameDate(isoString) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });

    return formatter.format(new Date(isoString)) + " ET";
}


/*
    Update the displayed date range when the week changes.
*/
function updateWeekDateDisplay() {
    const select = getElement("weekSelect");
    const weekDates = getElement("weekDates");

    if (!select || !weekDates) {
        return;
    }

    const week = NFL_WEEKS[select.value];

    if (!week) {
        weekDates.textContent = "";
        return;
    }

    weekDates.textContent =
        `${week.name}: ${formatDateOnly(week.start)} – ${formatDateOnly(week.end)}`;
}


function formatDateOnly(dateString) {
    const date = new Date(dateString + "T12:00:00");

    return new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    }).format(date);
}


/*
    Save the downloaded odds in localStorage.

    The API key is NEVER stored.
*/
function saveOddsToStorage(games) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(games)
        );

        localStorage.setItem(
            STORAGE_TIMESTAMP_KEY,
            new Date().toISOString()
        );

        return true;
    } catch (error) {
        console.error("Could not save odds:", error);
        return false;
    }
}


/*
    Restore previously downloaded odds.
*/
function loadOddsFromStorage() {
    try {
        const storedOdds = localStorage.getItem(STORAGE_KEY);

        if (!storedOdds) {
            return false;
        }

        const parsedOdds = JSON.parse(storedOdds);

        if (!Array.isArray(parsedOdds)) {
            return false;
        }

        allGames = parsedOdds;
        oddsLoaded = true;

        return true;

    } catch (error) {
        console.error("Could not load stored odds:", error);
        return false;
    }
}


/*
    Get the timestamp for previously downloaded odds.
*/
function getStoredOddsTimestamp() {
    try {
        return localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    } catch (error) {
        return null;
    }
}


/*
    Show when stored odds were downloaded.
*/
function updateStoredOddsStatus() {
    const element = getElement("storedOddsStatus");

    if (!element) {
        return;
    }

    const timestamp = getStoredOddsTimestamp();

    if (!timestamp) {
        element.textContent = "";
        return;
    }

    const date = new Date(timestamp);

    const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);

    element.textContent =
        `Previously downloaded odds restored from ${formatted} ET.`;
}


/*
    Assign confidence points purely by win probability.

    Highest probability gets 16.
    Lowest probability gets 1.

    Every game receives a unique point value.
*/
function assignConfidencePoints(picks) {
    const sortedPicks = [...picks].sort((a, b) => {
        if (b.probability !== a.probability) {
            return b.probability - a.probability;
        }

        /*
            If two probabilities are exactly equal, use game ID
            simply to provide a deterministic tie-breaker.
        */
        return String(a.id).localeCompare(String(b.id));
    });

    const totalGames = sortedPicks.length;

    sortedPicks.forEach((pick, index) => {
        pick.confidencePoints = totalGames - index;
    });

    return sortedPicks;
}


/*
    Filter the stored odds by the selected NFL week.
*/
function filterByWeek() {
    const select = getElement("weekSelect");
    const status = getElement("status");
    const filterButton = getElement("filterWeekButton");

    if (!select) {
        return;
    }

    const week = NFL_WEEKS[select.value];

    if (!week) {
        return;
    }

    if (!oddsLoaded) {
        currentPicks = [];

        if (filterButton) {
            filterButton.disabled = true;
        }

        renderResults();
        return;
    }

    const weekGames = allGames.filter(game => {
        const gameDate = dateOnlyInEastern(game.commence_time);

        return (
            gameDate >= week.start &&
            gameDate <= week.end
        );
    });

    const calculatedPicks = weekGames
        .map(game => calculateGamePick(game))
        .filter(pick => pick !== null);

    currentPicks = assignConfidencePoints(calculatedPicks);

    if (filterButton) {
        filterButton.disabled = false;
    }

    if (status) {
        status.className = "status success";
        status.textContent =
            `${week.name}: ${currentPicks.length} game(s) found.`;
    }

    renderResults();
}


/*
    Render the results table.
*/
function renderResults() {
    const results = getElement("results");
    const resultsTitle = getElement("resultsTitle");
    const resultsSubtitle = getElement("resultsSubtitle");
    const copyButton = getElement("copyPicksButton");

    if (!results) {
        return;
    }

    if (!oddsLoaded) {
        results.innerHTML = `
            <div class="empty-state">
                No odds have been loaded yet.
            </div>
        `;

        if (copyButton) {
            copyButton.disabled = true;
        }

        return;
    }

    const select = getElement("weekSelect");
    const week = select ? NFL_WEEKS[select.value] : null;

    if (resultsTitle) {
        resultsTitle.textContent = week
            ? `${week.name} Picks`
            : "NFL Picks";
    }

    if (!currentPicks.length) {
        results.innerHTML = `
            <div class="no-games">
                <strong>No games found.</strong>
                <p>
                    There are no downloaded games matching the selected week.
                </p>
            </div>
        `;

        if (resultsSubtitle) {
            resultsSubtitle.textContent =
                "Try another week or fetch fresh odds.";
        }

        if (copyButton) {
            copyButton.disabled = true;
        }

        return;
    }

    if (resultsSubtitle) {
        resultsSubtitle.textContent =
            `${currentPicks.length} game(s), ranked by sportsbook win probability.`;
    }

    const rows = currentPicks
        .map(pick => `
            <tr>
                <td class="date-cell">
                    ${escapeHtml(formatGameDate(pick.commenceTime))}
                </td>

                <td class="matchup">
                    ${escapeHtml(pick.awayTeam)}
                    @
                    ${escapeHtml(pick.homeTeam)}
                </td>

                <td class="pick">
                    ${escapeHtml(pick.pick)}
                </td>

                <td class="probability">
                    ${pick.probabilityPercent.toFixed(1)}%
                </td>

                <td class="points">
                    ${pick.confidencePoints}
                </td>

                <td class="bookmaker-count">
                    ${pick.bookmakerCount}
                </td>
            </tr>
        `)
        .join("");

    results.innerHTML = `
        <div class="recommendation-note">
            <strong>Point Assignment Recommendation:</strong>
            points are assigned purely by win probability.
            The highest-probability game receives 16 points and the
            lowest-probability game receives 1 point.
        </div>

        <div class="table-wrap">
            <table class="picks-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Matchup</th>
                        <th>Pick</th>
                        <th>Win Probability</th>
                        <th>Recommended Points</th>
                        <th>Sportsbooks</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    if (copyButton) {
        copyButton.disabled = false;
    }
}


/*
    Fetch the latest odds from The Odds API.

    This is the ONLY function that makes an API request.
*/
async function getOdds() {
    const apiKeyElement = getElement("apiKey");
    const button = getElement("getOddsButton");
    const status = getElement("status");
    const quota = getElement("quota");

    if (!apiKeyElement) {
        return;
    }

    const apiKey = apiKeyElement.value.trim();

    if (!apiKey) {
        if (status) {
            status.className = "status error";
            status.textContent = "Please enter your API key.";
        }

        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Getting Odds...";
    }

    if (status) {
        status.className = "status info";
        status.textContent = "Fetching latest NFL odds...";
    }

    try {
        const url =
            `${API_URL}?apiKey=${encodeURIComponent(apiKey)}` +
            `&regions=us` +
            `&markets=h2h` +
            `&oddsFormat=american`;

        const response = await fetch(url);

        if (!response.ok) {
            let errorMessage =
                `API request failed with status ${response.status}.`;

            try {
                const errorData = await response.json();

                if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (error) {
                // Keep the original error message.
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("The API returned an unexpected response.");
        }

        allGames = data;
        oddsLoaded = true;

        saveOddsToStorage(allGames);
        updateStoredOddsStatus();

        if (quota) {
            const remaining = response.headers.get("x-requests-remaining");
            const used = response.headers.get("x-requests-used");

            if (remaining !== null || used !== null) {
                quota.textContent =
                    `API usage: ${used ?? "?"} used, ${remaining ?? "?"} remaining.`;
            } else {
                quota.textContent = "";
            }
        }

        if (status) {
            status.className = "status success";
            status.textContent =
                `Successfully downloaded ${allGames.length} NFL game(s).`;
        }

        const filterButton = getElement("filterWeekButton");

        if (filterButton) {
            filterButton.disabled = false;
        }

        filterByWeek();

    } catch (error) {
        console.error(error);

        if (status) {
            status.className = "status error";
            status.textContent =
                `Error: ${error.message}`;
        }

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Get Latest Odds";
        }
    }
}


/*
    Escape HTML before inserting API data into the page.
*/
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/*
    Copy the currently displayed picks as HTML suitable for
    pasting into latest-picks.html.
*/
async function copyPicks() {
    const copyStatus = getElement("copyStatus");
    const select = getElement("weekSelect");

    if (!currentPicks.length || !select) {
        return;
    }

    const week = NFL_WEEKS[select.value];

    if (!week) {
        return;
    }

    const publishedDate = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date());

    const rows = currentPicks
        .map(pick => `
            <tr>
                <td class="date-cell">
                    ${escapeHtml(formatGameDate(pick.commenceTime))}
                </td>

                <td class="matchup">
                    ${escapeHtml(pick.awayTeam)}
                    @
                    ${escapeHtml(pick.homeTeam)}
                </td>

                <td class="pick">
                    ${escapeHtml(pick.pick)}
                </td>

                <td class="probability">
                    ${pick.probabilityPercent.toFixed(1)}%
                </td>

                <td class="points">
                    ${pick.confidencePoints}
                </td>
            </tr>
        `)
        .join("");

    const html = `
<div class="published-picks">

    <h2>${escapeHtml(week.name)}</h2>

    <p class="published-date">
        Published ${escapeHtml(publishedDate)} ET
    </p>

    <div class="recommendation-note">
        <strong>Point Assignment:</strong>
        Points are assigned purely by win probability.
        The highest-probability game receives 16 points and the
        lowest-probability game receives 1 point.
    </div>

    <div class="table-wrap">
        <table class="picks-table">

            <thead>
                <tr>
                    <th>Date</th>
                    <th>Matchup</th>
                    <th>Pick</th>
                    <th>Win Probability</th>
                    <th>Points</th>
                </tr>
            </thead>

            <tbody>
                ${rows}
            </tbody>

        </table>
    </div>

</div>
`;

    try {
        await navigator.clipboard.writeText(html);

        if (copyStatus) {
            copyStatus.textContent =
                "Copied! Paste the HTML inside the picks-content section of latest-picks.html.";
        }

    } catch (error) {
        console.error("Copy failed:", error);

        if (copyStatus) {
            copyStatus.textContent =
                "Copy failed. Please try again.";
        }
    }
}


/*
    Restore stored odds when index.html opens.
*/
function initializeStoredOdds() {
    const loaded = loadOddsFromStorage();

    updateStoredOddsStatus();

    if (!loaded) {
        return;
    }

    const filterButton = getElement("filterWeekButton");

    if (filterButton) {
        filterButton.disabled = false;
    }

    filterByWeek();
}


/*
    Event listeners.
*/
const getOddsButton = getElement("getOddsButton");

if (getOddsButton) {
    getOddsButton.addEventListener("click", getOdds);
}


const filterWeekButton = getElement("filterWeekButton");

if (filterWeekButton) {
    filterWeekButton.addEventListener("click", filterByWeek);
}


const weekSelect = getElement("weekSelect");

if (weekSelect) {
    weekSelect.addEventListener("change", updateWeekDateDisplay);
}


const copyPicksButton = getElement("copyPicksButton");

if (copyPicksButton) {
    copyPicksButton.addEventListener("click", copyPicks);
}


/*
    Initial page setup.
*/
updateWeekDateDisplay();
initializeStoredOdds();