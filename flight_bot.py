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

def format_flight_time(time_str):
    if not time_str:
        return "N/A"
    try:
        if " " in time_str:
            dt = datetime.datetime.strptime(time_str, "%Y-%m-%d %H:%M")
        else:
            dt = datetime.datetime.strptime(time_str, "%H:%M")
        return dt.strftime("%I:%M%p").lstrip("0")
    except Exception:
        return time_str

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
    results_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h1 style="color: #1e1b4b; text-align: center; font-size: 1.8em; margin-bottom: 20px;">✈️ Flight Price Bot Report</h1>
        <p style="font-size: 1.1em; color: #475569; text-align: center; margin-bottom: 30px;">Hi <strong>{email}</strong>, here is your curated deals update:</p>
        <ul style="padding: 0; margin: 0;">
    """
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
            min_price = best.get("price", "N/A")
            search_metadata = data.get("search_metadata", {})
            prettify_html_file = search_metadata.get("prettify_html_file", "#")
            
            examples_html = "<ul style='padding-left: 20px;'>"
            for idx, item in enumerate(flights_list[:3]):
                price = item.get("price", "N/A")
                duration = item.get("total_duration", "N/A")
                
                airlines = []
                segments = []
                for f_segment in item.get("flights", []):
                    airline = f_segment.get("airline")
                    if airline and airline not in airlines:
                        airlines.append(airline)
                        
                    dep = f_segment.get("departure_airport", {})
                    arr = f_segment.get("arrival_airport", {})
                    
                    dep_id = dep.get("id", "Unknown")
                    dep_time = format_flight_time(dep.get("time"))
                    
                    arr_id = arr.get("id", "Unknown")
                    arr_time = format_flight_time(arr.get("time"))
                    
                    segments.append(f"{dep_id} {dep_time} -> {arr_id} {arr_time}")
                    
                airlines_str = ", ".join(airlines) if airlines else "Multiple Airlines"
                route_str = " / ".join(segments) if segments else "Route Unknown"
                
                examples_html += f"<li style='margin-bottom: 10px;'>Option {idx+1}: <strong>{price} BRL</strong> - {airlines_str}<br><span style='font-size: 0.9em; color: #64748b; font-weight: bold;'>{route_str}</span> <span style='font-size: 0.9em; color: #94a3b8;'>({duration})</span></li>"
            examples_html += "</ul>"
            
            results_html += f"""
            <li style='margin-bottom: 25px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1; list-style-type: none;'>
                <h3 style='margin: 0 0 10px 0; color: #4f46e5; font-size: 1.2em;'>{title}</h3>
                <p style='margin: 5px 0;'>🔥 <strong>Minimum Price Found:</strong> <span style='color: #10b981; font-size: 1.2em; font-weight: bold;'>{min_price} BRL</span></p>
                <p style='margin: 15px 0 5px 0; font-weight: bold; color: #1e293b;'>Top 3 Flight Examples:</p>
                {examples_html}
                <div style='margin-top: 15px;'>
                    <a href='{prettify_html_file}' style='display: inline-block; background-color: #6366f1; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 0.9em;'>View Prettified Search Results</a>
                </div>
            </li>
            """


    results_html += "</ul></div>"

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
