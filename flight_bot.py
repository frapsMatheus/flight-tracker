import os
import json
import requests
import resend
from dotenv import load_dotenv

# Load local .env for testing (in GitHub Actions, variables come from Secrets)
load_dotenv()

SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
TARGET_EMAIL = os.environ.get("TARGET_EMAIL")
OBSERVED_FLIGHTS_JSON = os.environ.get("OBSERVED_FLIGHTS", "[]")

resend.api_key = RESEND_API_KEY

def fetch_flights(flight_config):
    params = {
        "api_key": SERPAPI_KEY,
        "engine": "google_flights",
        "hl": "pt-br",
        "gl": "br",
        "currency": "BRL",
        "deep_search": "true", # Requested for precision
        "sort_by": "2", # Always sort by price
    }
    # Append all relevant keys from flight_config
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

def main():
    if not SERPAPI_KEY or not RESEND_API_KEY or not TARGET_EMAIL:
        print("Missing required environment variables (SERPAPI_KEY, RESEND_API_KEY, TARGET_EMAIL).")
        return

    try:
        flights_to_observe = json.loads(OBSERVED_FLIGHTS_JSON)
    except Exception as e:
        print(f"Error parsing OBSERVED_FLIGHTS: {e}")
        return

    results_html = "<h1>Flight Price Deals Report</h1><ul>"

    for flight in flights_to_observe:
        title = flight.get("title", "Unknown Flight")
        print(f"Searching: {title}...")
        
        data = fetch_flights(flight)
        if not data:
            results_html += f"<li><strong>{title}</strong>: Failed to fetch data.</li>"
            continue
        
        flights_list = data.get("best_flights", [])
        if not flights_list:
            flights_list = data.get("other_flights", [])
            
        if not flights_list:
            results_html += f"<li><strong>{title}</strong>: No flights found.</li>"
            continue
            
        best = flights_list[0] 
        price = best.get("price", "N/A")
        
        search_metadata = data.get("search_metadata", {})
        prettify_html_file = search_metadata.get("prettify_html_file", "#")
        
        results_html += f"<li><p><strong>{title}</strong> - Minimum price: <strong>{price} BRL</strong></p><a href='{prettify_html_file}'>View Prettified Search Results</a></li>"

    results_html += "</ul>"

    print("Sending email report...")
    try:
        r = resend.Emails.send({
            "from": "onboarding@resend.dev", # Required for resend sandboxes unless custom domain is verified
            "to": TARGET_EMAIL,
            "subject": "Flight Prices Update",
            "html": results_html
        })
        print(f"Email sent successfully: {r}")
    except Exception as e:
        print(f"Error sending email: {e}")

if __name__ == "__main__":
    main()
