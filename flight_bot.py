import os
import json
import datetime
import requests
import resend
from dotenv import load_dotenv
from supabase import create_client, Client

# Load local .env for testing
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def fetch_flights(flight_config, serpapi_key):
    params = {
        "api_key": serpapi_key,
        "engine": "google_flights",
        "hl": "pt-br",
        "gl": "br",
        "currency": "BRL",
        "deep_search": "true",
        "sort_by": "2",
    }
    
    for key, value in flight_config.items():
        if key != "title":
            if isinstance(value, (dict, list)):
                params[key] = json.dumps(value)
            else:
                params[key] = value
            
    try:
        response = requests.get("https://serpapi.com/search", params=params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching {flight_config.get('title')}: {e}")
        return None

def process_user_flights(supabase: Client, user):
    user_id = user.get("id")
    email = user.get("email")
    serpapi_key = user.get("serpapi_key")
    resend_api_key = os.environ.get("RESEND_API_KEY")

    if not serpapi_key:
        print(f"Skipping user {email}: Missing SerpAPI key.")
        return

    if not resend_api_key:
        print(f"Skipping user {email}: Missing master Resend API key in environment.")
        return

    print(f"\nProcessing flights for user: {email}...")

    # Fetch observed flights for this user
    try:
        response = supabase.table("observed_flights").select("*").eq("user_id", user_id).execute()
        flights = response.data
    except Exception as e:
        print(f"Error fetching flights for {email}: {e}")
        return

    if not flights:
        print(f"No flights observed for {email}.")
        return

    resend.api_key = resend_api_key
    results_html = f"<h1>Flight Price Deals Report</h1><p>Hi {email}, here is your update:</p><ul>"
    checked_any = False

    for flight in flights:
        title = flight.get("title", "Unknown Flight")
        flight_config = flight.get("flight_config", {})

        print(f"  -> Searching: {title}...")
        checked_any = True
            
        data = fetch_flights(flight_config, serpapi_key)
        if not data:
            results_html += f"<li><strong>{title}</strong>: Failed to fetch data.</li>"
            continue
        
        flights_list = data.get("best_flights", [])
        if not flights_list:
            flights_list = data.get("other_flights", [])
            
        if not flights_list:
            results_html += f"<li><strong>{title}</strong>: No flights found.</li>"
        else:
            best = flights_list[0] 
            price = best.get("price", "N/A")
            search_metadata = data.get("search_metadata", {})
            prettify_html_file = search_metadata.get("prettify_html_file", "#")
            results_html += f"<li><p><strong>{title}</strong> - Minimum price: <strong>{price} BRL</strong></p><a href='{prettify_html_file}'>View Prettified Search Results</a></li>"


    results_html += "</ul>"

    if checked_any:
        print(f"Sending email report to {email}...")
        try:
            r = resend.Emails.send({
                "from": "onboarding@resend.dev",
                "to": email,
                "subject": "FlightBot: Prices Update",
                "html": results_html
            })
            print(f"Email sent successfully: {r}")
        except Exception as e:
            print(f"Error sending email to {email}: {e}")
    else:
        print(f"No flights needed checking for {email} in this run.")

def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).")
        print("Please configure them in your secrets / .env file.")
        return

    print("Initializing Supabase Client...")
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")
        return

    # Fetch all users
    try:
        response = supabase.table("user_profiles").select("*").execute()
        users = response.data
    except Exception as e:
        print(f"Error fetching user profiles: {e}")
        return

    if not users:
        print("No user profiles found in Supabase.")
        return

    print(f"Found {len(users)} user profiles.")
    for user in users:
        process_user_flights(supabase, user)

if __name__ == "__main__":
    main()
