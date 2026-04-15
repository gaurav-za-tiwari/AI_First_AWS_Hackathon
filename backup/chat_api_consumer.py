import requests
import json

# Placeholder for AWS hostname - replace with your actual endpoint
ENDPOINT = "http://wiphackq0vcsii.cloudloka.com:8000/v1/completions"
# sudo curl http://wiphackxlw49hx.cloudloka.com:8000/v1/chat/completions -H "Content-Type: application/json" -d '{"model": "Qwen/Qwen3-8B", "messages": [ {"role": "user", "content": "What is KV cache in transformers?"}], "max_tokens": 128, "temperature": 0.7}'
# API endpoint for chat completions
#ENDPOINT = f"{HOSTNAME}/v1/chat/completions"

def consume_chat_api():
    """
    Consumes the chat/completions API and records the response.
    """
    headers = {
        "Content-Type": "application/json"
    }

    # Example payload for chat completion
    payload = {
        "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",  # Replace with actual model name
        "prompt": "What is Machine Learning?",
        "max_tokens": 100,
        "temperature": 0.5  # Adjust as needed
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
