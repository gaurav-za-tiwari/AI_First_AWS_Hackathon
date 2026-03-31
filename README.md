# AI_First_AWS_Hackathon
This repository is created to store the code that will be developed as part of AWS Intel AI Hackathon.

## Chat API Consumer Script

A Python script that consumes a chat/completions API for AWS-hosted models and records the response.

### Setup
1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Update the placeholders in `chat_api_consumer.py`:
   - Replace `HOSTNAME` with your actual AWS endpoint URL
   - Replace `API_KEY` with your actual API key
   - Replace `your-model-name` with the actual model name

### Usage
Run the script:
```
python chat_api_consumer.py
```

The API response will be printed to the console and saved to `api_response.json`. 
