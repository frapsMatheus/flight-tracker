let supabaseClient = null;
let currentUser = null;
let editingFlightId = null;
let airports = [];

if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL") {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) {
        console.error("FlightBot error: Supabase credentials missing. Check docs/config.js.");
        return;
    }

    loadAirports();



    // Check current session
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        setupDashboard();
    } else {
        setupLogin();
    }

    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            setupDashboard();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            setupLogin();
        }
    });

    // Event Listeners
    document.getElementById("login-form").addEventListener("submit", sendMagicLink);
    document.getElementById("keys-form").addEventListener("submit", saveKeys);
    document.getElementById("flight-form").addEventListener("submit", addFlight);
    document.getElementById("flight_type").addEventListener("change", handleFlightTypeChange);
    handleFlightTypeChange();

    // Setup Smart Search Autocomplete
    setupAutocomplete("departure_id", "departure-dropdown");
    setupAutocomplete("arrival_id", "arrival-dropdown");
});

function setupLogin() {
    document.getElementById("login-section").classList.remove("hidden");
    document.getElementById("dashboard-section").classList.add("hidden");
    document.getElementById("nav-auth").innerHTML = ``;
}

async function sendMagicLink(e) {
    e.preventDefault();
    const email = document.getElementById("login_email").value;
    if (!email) {
        alert("Please enter your email.");
        return;
    }

    const btn = document.getElementById("btn-send-otp");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending Link...`;
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: 'https://frapsmatheus.github.io/flight-tracker/'
            }
        });
        if (error) throw error;
        
        alert("Magic login link sent! Please check your email to sign in.");
    } catch (e) {
        console.error("Error sending magic link:", e);
        alert("Failed to send login link: " + e.message);
    } finally {
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Magic Link`;
        btn.disabled = false;
    }
}

async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error("Logout error:", error);
}

async function setupDashboard() {
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("dashboard-section").classList.remove("hidden");
    document.getElementById("nav-auth").innerHTML = `
        <span class="user-email"><i class="fa-solid fa-user"></i> ${currentUser.email}</span>
        <button class="btn-secondary" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
    `;

    // Fetch user profile keys
    fetchUserProfile();
    // Fetch observed flights
    fetchObservedFlights();
}

async function fetchUserProfile() {
    try {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('serpapi_key')
            .eq('id', currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (data && data.serpapi_key) {
            document.getElementById("serpapi_key").value = data.serpapi_key;
        }
    } catch (e) {
        console.error("Error fetching profile:", e);
    }
}

async function saveKeys(e) {
    e.preventDefault();
    const serpapi_key = document.getElementById("serpapi_key").value;

    const btn = document.getElementById("btn-save-keys");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('user_profiles')
            .upsert({
                id: currentUser.id,
                email: currentUser.email,
                serpapi_key: serpapi_key
            });

        if (error) throw error;
        alert("Key saved successfully!");
    } catch (e) {
        console.error("Error saving key:", e);
        alert("Failed to save key: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function fetchObservedFlights() {
    try {
        const { data, error } = await supabaseClient
            .from('observed_flights')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        renderFlights(data);
    } catch (e) {
        console.error("Error fetching flights:", e);
    }
}

function renderFlights(flights) {
    const container = document.getElementById("flights-container");
    const countBadge = document.getElementById("flight-count");
    
    countBadge.innerText = `${flights.length} Flight${flights.length !== 1 ? 's' : ''}`;

    if (!flights || flights.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-plane-slash"></i>
                <p>No flights observed yet. Add your first flight to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = flights.map(flight => {
        const config = flight.flight_config;
        const isOneWay = String(config.type) === "2";
        const badgeClass = isOneWay ? "badge-one-way" : "badge-round-trip";
        const typeLabel = isOneWay ? "One Way" : "Round Trip";
        const route = `${config.departure_id} <i class="fa-solid fa-arrow-right"></i> ${config.arrival_id}`;
        const dates = `${config.outbound_date}${!isOneWay && config.return_date ? ` | ${config.return_date}` : ''}`;
        
        return `
            <div class="flight-item">
                <div class="flight-info">
                    <div class="flight-icon">
                        <i class="fa-solid ${isOneWay ? 'fa-plane-departure' : 'fa-plane'}"></i>
                    </div>
                    <div class="flight-details">
                        <h4>${flight.title} <span class="flight-type-badge ${badgeClass}">${typeLabel}</span></h4>
                        <p class="flight-route">${route}</p>
                        <p class="flight-route"><i class="fa-solid fa-calendar-days"></i> ${dates}</p>
                    </div>
                </div>
                <div class="flight-actions" style="display: flex; gap: 0.75rem;">
                    <button class="btn-edit" onclick="editFlight('${flight.id}')" title="Edit Observation" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 1.25rem;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteFlight('${flight.id}')" title="Delete Observation">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

async function addFlight(e) {
    e.preventDefault();
    
    const title = document.getElementById("flight_title").value;
    let departure_id = document.getElementById("departure_id").value;
    let arrival_id = document.getElementById("arrival_id").value;

    // Sanitize multiairport queries (comma-separated, no spaces, uppercase 3-letter codes)
    departure_id = departure_id.split(",").map(t => {
        t = t.trim();
        return t.length === 3 ? t.toUpperCase() : t;
    }).filter(t => t).join(",");

    arrival_id = arrival_id.split(",").map(t => {
        t = t.trim();
        return t.length === 3 ? t.toUpperCase() : t;
    }).filter(t => t).join(",");
    const outbound_date = document.getElementById("outbound_date").value;
    const return_date = document.getElementById("return_date").value;
    const type = parseInt(document.getElementById("flight_type").value);
    const adults = parseInt(document.getElementById("adults").value);

    if (type === 1 && !return_date) {
        alert("Please select a return date for round trip flights.");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    const flight_config = {
        departure_id,
        arrival_id,
        outbound_date,
        type,
        adults,
        currency: "BRL",
        hl: "pt-br",
        gl: "br"
    };

    if (type === 1 && return_date) {
        flight_config.return_date = return_date;
    }

    const btn = document.getElementById("btn-add-flight");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${editingFlightId ? 'Updating...' : 'Adding...'}`;
    btn.disabled = true;

    try {
        let res;
        if (editingFlightId) {
            res = await supabaseClient
                .from('observed_flights')
                .update({
                    title: title,
                    flight_config: flight_config
                })
                .eq('id', editingFlightId);
        } else {
            res = await supabaseClient
                .from('observed_flights')
                .insert({
                    user_id: currentUser.id,
                    title: title,
                    flight_config: flight_config
                });
        }

        if (res.error) throw res.error;
        
        if (editingFlightId) {
            cancelEdit();
        } else {
            document.getElementById("flight-form").reset();
            document.getElementById("flight_type").value = "1";
            document.getElementById("adults").value = "1";
            handleFlightTypeChange();
        }
        
        fetchObservedFlights();
    } catch (e) {
        console.error("Error adding flight:", e);
        alert("Failed to add flight: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function deleteFlight(id) {
    if (!confirm("Are you sure you want to stop observing this flight?")) return;

    try {
        const { error } = await supabaseClient
            .from('observed_flights')
            .delete()
            .eq('id', id);

        if (error) throw error;
        fetchObservedFlights();
    } catch (e) {
        console.error("Error deleting flight:", e);
        alert("Failed to delete flight: " + e.message);
    }
}

function togglePassword(id) {
    const input = document.getElementById(id);
    const icon = input.nextElementSibling.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fa-solid fa-eye-slash";
    } else {
        input.type = "password";
        icon.className = "fa-solid fa-eye";
    }
}

// String normalization helper (removes accents/diacritics and converts to lowercase)
function normalizeText(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Damerau-Levenshtein distance helper with transposition tolerance for typos on siglas and words
function damerauLevenshtein(s1, s2) {
    const len1 = s1.length;
    const len2 = s2.length;
    const d = [];

    for (let i = 0; i <= len1; i++) {
        d[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        d[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,       // deletion
                d[i][j - 1] + 1,       // insertion
                d[i - 1][j - 1] + cost // substitution
            );
            if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
            }
        }
    }
    return d[len1][len2];
}

// Smart Search Autocomplete
function setupAutocomplete(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let debounceTimer;

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const value = input.value;
        const tokens = value.split(",").map(t => t.trim());
        const currentToken = tokens[tokens.length - 1];

        if (!currentToken || currentToken.length < 2) {
            dropdown.classList.add("hidden");
            return;
        }

        // Only skip Google Knowledge Graph kgmids
        if (currentToken.startsWith("/m/") || currentToken.startsWith("/g/")) {
            dropdown.classList.add("hidden");
            return;
        }

        debounceTimer = setTimeout(() => {
            fetchSuggestions(currentToken, (suggestions) => {
                renderSuggestions(suggestions, input, dropdown, tokens);
            });
        }, 200);
    });

    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
        }
    });
}

async function loadAirports() {
    try {
        const res = await fetch('aerodromos.csv');
        const text = await res.text();
        const lines = text.split('\n');
        
        airports = [];
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const parts = lines[i].split(';');
            if (parts.length >= 6) {
                const icao = parts[0].trim();
                const iata = parts[1].trim();
                const name = parts[2].trim();
                const city = parts[3].trim();
                const state = parts[4].trim();
                const country = parts[5].trim();
                if (iata && iata !== '...' && iata !== 'N/I') {
                    airports.push({
                        icao: icao,
                        iata: iata,
                        name: name,
                        city: city,
                        state: state,
                        country: country,
                        // Pre-normalized fields for fast fuzzy search
                        normIata: normalizeText(iata),
                        normIcao: normalizeText(icao),
                        normName: normalizeText(name),
                        normCity: normalizeText(city),
                        normCountry: normalizeText(country)
                    });
                }
            }
        }
        console.log(`Loaded ${airports.length} airports from CSV.`);
    } catch (e) {
        console.error("Error loading airports CSV:", e);
    }
}

function fetchSuggestions(query, callback) {
    if (airports.length === 0) {
        callback([]);
        return;
    }

    const q = normalizeText(query);
    if (!q || q.length < 2) {
        callback([]);
        return;
    }

    const scored = [];
    const qLen = q.length;

    for (let i = 0; i < airports.length; i++) {
        const airport = airports[i];
        let score = 0;

        // 1. Sigla IATA match (highest priority)
        if (airport.normIata === q) {
            score = 1000;
        } else if (airport.normIcao === q) {
            score = 950;
        } else if (airport.normIata.startsWith(q)) {
            score = Math.max(score, 850 + (qLen * 20));
        } else if (qLen >= 2) {
            const distIata = damerauLevenshtein(q, airport.normIata);
            if (qLen === 3 && distIata === 1) {
                // 1-character typo or transposition on 3-letter IATA sigla
                score = Math.max(score, 750);
            } else if (qLen === 2 && distIata === 1 && airport.normIata.startsWith(q[0])) {
                score = Math.max(score, 500);
            }
        }

        // 2. Sigla ICAO match
        if (airport.normIcao.startsWith(q)) {
            score = Math.max(score, 650 + (qLen * 10));
        } else if (qLen >= 3) {
            const distIcao = damerauLevenshtein(q, airport.normIcao);
            if (qLen === 4 && distIcao === 1) {
                score = Math.max(score, 550);
            }
        }

        // 3. City match
        if (airport.normCity) {
            if (airport.normCity === q) {
                score = Math.max(score, 500);
            } else if (airport.normCity.startsWith(q)) {
                score = Math.max(score, 450);
            } else if (airport.normCity.includes(q)) {
                score = Math.max(score, 350);
            } else if (qLen >= 4) {
                const words = airport.normCity.split(/\s+/);
                for (let w = 0; w < words.length; w++) {
                    const word = words[w];
                    if (word.startsWith(q)) {
                        score = Math.max(score, 400);
                    } else if (word.length >= 3 && damerauLevenshtein(q, word) <= (qLen <= 5 ? 1 : 2)) {
                        score = Math.max(score, 320);
                    }
                }
            }
        }

        // 4. Airport Name match
        if (airport.normName) {
            if (airport.normName === q) {
                score = Math.max(score, 480);
            } else if (airport.normName.startsWith(q)) {
                score = Math.max(score, 420);
            } else if (airport.normName.includes(q)) {
                score = Math.max(score, 300);
            } else if (qLen >= 4) {
                const words = airport.normName.split(/\s+/);
                for (let w = 0; w < words.length; w++) {
                    const word = words[w];
                    if (word.startsWith(q)) {
                        score = Math.max(score, 380);
                    } else if (word.length >= 3 && damerauLevenshtein(q, word) <= (qLen <= 5 ? 1 : 2)) {
                        score = Math.max(score, 280);
                    }
                }
            }
        }

        // 5. Country match
        if (airport.normCountry && airport.normCountry.includes(q)) {
            score = Math.max(score, 100);
        }

        // Slight tie-breaker preference for Brazilian airports
        if (score > 0 && airport.normCountry === 'brasil') {
            score += 5;
        }

        if (score > 0) {
            scored.push({ airport, score });
        }
    }

    scored.sort((a, b) => b.score - a.score);

    const suggestions = scored.slice(0, 10).map(item => ({
        iata: item.airport.iata,
        icao: item.airport.icao,
        label: item.airport.name,
        desc: `${item.airport.city}${item.airport.state ? `, ${item.airport.state}` : ''} - ${item.airport.country}`,
        freebaseId: null
    }));

    callback(suggestions);
}

function renderSuggestions(suggestions, input, dropdown, tokens) {
    if (suggestions.length === 0) {
        dropdown.classList.add("hidden");
        return;
    }

    dropdown.innerHTML = suggestions.map(s => {
        let codeLabel = s.iata;
        if (s.icao && s.icao !== s.iata) {
            codeLabel += ` · ${s.icao}`;
        }
        return `
            <div class="autocomplete-item" onclick="selectSuggestion('${input.id}', '${dropdown.id}', '${s.iata}')">
                <span class="autocomplete-item-code">${codeLabel}</span>
                <div class="autocomplete-item-title">${s.label}</div>
                <div class="autocomplete-item-desc">${s.desc}</div>
            </div>
        `;
    }).join("");

    dropdown.classList.remove("hidden");
}

function selectSuggestion(inputId, dropdownId, code) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    
    const value = input.value;
    const tokens = value.split(",").map(t => t.trim());
    
    // Replace the last token with the selected code
    tokens[tokens.length - 1] = code;
    
    input.value = tokens.join(", ") + ", ";
    dropdown.classList.add("hidden");
    input.focus();
}

async function editFlight(id) {
    try {
        const { data, error } = await supabaseClient
            .from('observed_flights')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return;

        editingFlightId = id;
        const config = data.flight_config;

        document.getElementById("form-title").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Flight`;
        document.getElementById("btn-add-flight").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update Flight`;
        document.getElementById("btn-cancel-edit").classList.remove("hidden");

        document.getElementById("flight_title").value = data.title;
        document.getElementById("departure_id").value = config.departure_id;
        document.getElementById("arrival_id").value = config.arrival_id;
        document.getElementById("flight_type").value = config.type || "1";
        handleFlightTypeChange();
        document.getElementById("outbound_date").value = config.outbound_date;
        document.getElementById("return_date").value = config.return_date || "";
        document.getElementById("adults").value = config.adults;

        document.getElementById("flight_title").focus();
    } catch (e) {
        console.error("Error loading flight for edit:", e);
        alert("Failed to load flight data.");
    }
}

function cancelEdit() {
    editingFlightId = null;
    document.getElementById("form-title").innerHTML = `<i class="fa-solid fa-plus"></i> Observe New Flight`;
    document.getElementById("btn-add-flight").innerHTML = `<i class="fa-solid fa-circle-plus"></i> Add Flight`;
    document.getElementById("btn-cancel-edit").classList.add("hidden");
    
    document.getElementById("flight-form").reset();
    document.getElementById("flight_type").value = "1";
    document.getElementById("adults").value = "1";
    handleFlightTypeChange();
}

function handleFlightTypeChange() {
    const flightType = document.getElementById("flight_type").value;
    const returnDateGroup = document.getElementById("return_date_group");
    const returnDateInput = document.getElementById("return_date");
    const datesRow = document.getElementById("dates-row");

    if (flightType === "2") {
        if (returnDateGroup) returnDateGroup.classList.add("hidden");
        if (datesRow) datesRow.classList.add("one-way");
        if (returnDateInput) {
            returnDateInput.required = false;
            returnDateInput.value = "";
        }
    } else {
        if (returnDateGroup) returnDateGroup.classList.remove("hidden");
        if (datesRow) datesRow.classList.remove("one-way");
        if (returnDateInput) {
            returnDateInput.required = true;
        }
    }
}

window.handleFlightTypeChange = handleFlightTypeChange;
window.editFlight = editFlight;
window.cancelEdit = cancelEdit;

window.selectSuggestion = selectSuggestion;

window.logout = logout;
window.deleteFlight = deleteFlight;
