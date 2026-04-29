let supabaseClient = null;
let currentUser = null;

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
    document.getElementById("btn-send-otp").addEventListener("click", sendOtp);
    document.getElementById("login-form").addEventListener("submit", verifyOtp);
    document.getElementById("keys-form").addEventListener("submit", saveKeys);
    document.getElementById("flight-form").addEventListener("submit", addFlight);
});


function setupLogin() {
    document.getElementById("login-section").classList.remove("hidden");
    document.getElementById("dashboard-section").classList.add("hidden");
    document.getElementById("nav-auth").innerHTML = ``;
}

async function sendOtp(e) {
    e.preventDefault();
    const email = document.getElementById("login_email").value;
    if (!email) {
        alert("Please enter your email.");
        return;
    }

    const btn = document.getElementById("btn-send-otp");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true
            }
        });
        if (error) throw error;
        
        // Show OTP input
        document.getElementById("otp-group").classList.remove("hidden");
        alert("Verification code (or magic link) sent to your email!");
    } catch (e) {
        console.error("Error sending OTP:", e);
        alert("Failed to send verification code: " + e.message);
    } finally {
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Verification Code`;
        btn.disabled = false;
    }
}

async function verifyOtp(e) {
    e.preventDefault();
    const email = document.getElementById("login_email").value;
    const token = document.getElementById("login_otp").value;

    if (!token) {
        alert("Please enter the verification code.");
        return;
    }

    const btn = document.getElementById("btn-verify-otp");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying...`;
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.auth.verifyOtp({
            email,
            token,
            type: 'email'
        });
        if (error) throw error;
    } catch (e) {
        console.error("Verification failed:", e);
        alert("Verification failed: " + e.message);
    } finally {
        btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Verify & Login`;
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
    const departure_id = document.getElementById("departure_id").value;
    const arrival_id = document.getElementById("arrival_id").value;
    const outbound_date = document.getElementById("outbound_date").value;
    const return_date = document.getElementById("return_date").value;
    const type = parseInt(document.getElementById("flight_type").value);
    const adults = parseInt(document.getElementById("adults").value);

    const btn = document.getElementById("btn-add-flight");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Adding...`;
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
        const { error } = await supabaseClient
            .from('observed_flights')
            .insert({
                user_id: currentUser.id,
                title: title,
                flight_config: flight_config
            });

        if (error) throw error;
        
        document.getElementById("flight-form").reset();
        document.getElementById("flight_type").value = "1";
        document.getElementById("adults").value = "1";
        
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

window.logout = logout;
window.deleteFlight = deleteFlight;
window.sendOtp = sendOtp;
