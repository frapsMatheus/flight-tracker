let supabaseClient = null;
let currentUser = null;
let editingFlightId = null;

if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL") {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) {
        console.error("FlightBot error: Supabase credentials missing. Check docs/config.js.");
        return;
    }



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
        const route = `${config.departure_id} <i class="fa-solid fa-arrow-right"></i> ${config.arrival_id}`;
        const dates = `${config.outbound_date} ${config.return_date ? `| ${config.return_date}` : ''}`;
        
        return `
            <div class="flight-item">
                <div class="flight-info">
                    <div class="flight-icon">
                        <i class="fa-solid fa-plane"></i>
                    </div>
                    <div class="flight-details">
                        <h4>${flight.title}</h4>
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

    const btn = document.getElementById("btn-add-flight");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${editingFlightId ? 'Updating...' : 'Adding...'}`;
    btn.disabled = true;

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

    if (return_date) {
        flight_config.return_date = return_date;
    }

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

        // Don't search for 3-letter IATA codes or kgmids that the user is explicitly typing
        if (currentToken.match(/^[A-Z]{3}$/) || currentToken.startsWith("/m/") || currentToken.startsWith("/g/")) {
            dropdown.classList.add("hidden");
            return;
        }

        debounceTimer = setTimeout(() => {
            fetchSuggestions(currentToken, (suggestions) => {
                renderSuggestions(suggestions, input, dropdown, tokens);
            });
        }, 300);
    });

    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
        }
    });
}

async function fetchSuggestions(query, callback) {
    try {
        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=pt&format=json&origin=*&type=item`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const searchResults = searchData.search || [];

        if (searchResults.length === 0) {
            callback([]);
            return;
        }

        const qids = searchResults.slice(0, 5).map(item => item.id).join("|");
        const getUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids}&props=claims|labels|descriptions&languages=pt&format=json&origin=*`;
        const getRes = await fetch(getUrl);
        const getData = await getRes.json();
        const entities = getData.entities || {};

        const suggestions = [];

        for (const item of searchResults) {
            const entity = entities[item.id];
            if (!entity) continue;

            const label = entity.labels?.pt?.value || item.label || item.id;
            const desc = entity.descriptions?.pt?.value || item.description || "";
            const claims = entity.claims || {};

            const iataClaims = claims.P238 || [];
            const iata = iataClaims[0]?.mainsnak?.datavalue?.value;

            const freebaseClaims = claims.P646 || [];
            const freebaseId = freebaseClaims[0]?.mainsnak?.datavalue?.value;

            if (iata || freebaseId) {
                suggestions.push({
                    id: item.id,
                    label,
                    desc,
                    iata,
                    freebaseId
                });
            }
        }

        callback(suggestions);
    } catch (e) {
        console.error("Error fetching suggestions:", e);
        callback([]);
    }
}

function renderSuggestions(suggestions, input, dropdown, tokens) {
    if (suggestions.length === 0) {
        dropdown.classList.add("hidden");
        return;
    }

    dropdown.innerHTML = suggestions.map(s => {
        let optionsHtml = "";
        if (s.iata) {
            optionsHtml += `
                <div class="autocomplete-item" onclick="selectSuggestion('${input.id}', '${dropdown.id}', '${s.iata}')">
                    <span class="autocomplete-item-code">${s.iata}</span>
                    <div class="autocomplete-item-title">${s.label}</div>
                    <div class="autocomplete-item-desc">${s.desc}</div>
                </div>
            `;
        }
        if (s.freebaseId && s.freebaseId !== s.iata) {
            optionsHtml += `
                <div class="autocomplete-item" onclick="selectSuggestion('${input.id}', '${dropdown.id}', '${s.freebaseId}')">
                    <span class="autocomplete-item-code">${s.freebaseId}</span>
                    <div class="autocomplete-item-title">${s.label}</div>
                    <div class="autocomplete-item-desc">${s.desc}</div>
                </div>
            `;
        }
        return optionsHtml;
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
        document.getElementById("outbound_date").value = config.outbound_date;
        document.getElementById("return_date").value = config.return_date || "";
        document.getElementById("flight_type").value = config.type;
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
}

window.editFlight = editFlight;
window.cancelEdit = cancelEdit;

window.selectSuggestion = selectSuggestion;

window.logout = logout;
window.deleteFlight = deleteFlight;
window.sendOtp = sendOtp;
