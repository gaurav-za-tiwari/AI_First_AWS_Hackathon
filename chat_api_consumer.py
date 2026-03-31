import requests
import json

# Placeholder for AWS hostname - replace with your actual endpoint
HOSTNAME = "https://your-aws-endpoint.amazonaws.com"

# API endpoint for chat completions
ENDPOINT = f"{HOSTNAME}/v1/chat/completions"

# Placeholder for API key - replace with your actual key
API_KEY = "YOUR_API_KEY"

def consume_chat_api():
    """
    Consumes the chat/completions API and records the response.
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # Example payload for chat completion
    payload = {
        "model": "your-model-name",  # Replace with actual model name
        "messages": [
            {"role": "user", "content": "Hello, how are you?"}
        ],
        "max_tokens": 100  # Adjust as needed
    }

    try:
        response = requests.post(ENDPOINT, headers=headers, json=payload)

        if response.status_code == 200:
            data = response.json()
            print("API Response:")
            print(json.dumps(data, indent=4))

            # Record the response to a file
            with open("api_response.json", "w") as f:
                json.dump(data, f, indent=4)
            print("Response recorded to api_response.json")
        else:
            print(f"Error: {response.status_code}")
            print(response.text)

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    consume_chat_api()