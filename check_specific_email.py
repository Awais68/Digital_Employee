
import os.path
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

# If modifying these SCOPES, delete the file token.pickle.
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def main():
    creds = None
    if os.path.exists('token.json'):
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            print("No valid credentials found. Please run authentication.")
            return

    service = build('gmail', 'v1', credentials=creds)

    # Search for email from specific sender
    query = 'from:anasuddyn56@gmail.com'
    print(f"Searching for: {query}")
    results = service.users().messages().list(userId='me', q=query).execute()
    messages = results.get('messages', [])

    if not messages:
        print("No messages found from this sender.")
    else:
        print(f"Found {len(messages)} messages:")
        for message in messages:
            msg = service.users().messages().get(userId='me', id=message['id']).execute()
            payload = msg['payload']
            headers = payload['headers']
            subject = "No Subject"
            for d in headers:
                if d['name'] == 'Subject':
                    subject = d['value']
            print(f"- ID: {message['id']} | Subject: {subject} | Snippet: {msg['snippet']}")

if __name__ == '__main__':
    main()
