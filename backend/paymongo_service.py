import requests
import json
import base64
import hashlib
import hmac
import os
from datetime import datetime


class PayMongoService:
    def __init__(self, secret_key, public_key, webhook_secret=None):
        self.secret_key = secret_key
        self.public_key = public_key
        self.webhook_secret = webhook_secret
        self.base_url = "https://api.paymongo.com/v1"
        
        # Create authorization header for API requests
        auth_string = f"{secret_key}:"
        auth_bytes = auth_string.encode('ascii')
        auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
        self.headers = {
            "Authorization": f"Basic {auth_b64}",
            "Content-Type": "application/json"
        }
    
    def create_payment_intent(self, amount, currency="PHP", description="Payment", metadata=None):
        """
        Create a PayMongo Payment Intent
        Amount should be in centavos (e.g., 100.00 PHP = 10000 centavos)
        """
        url = f"{self.base_url}/payment_intents"
        
        # Convert amount to centavos if it's in pesos
        if amount < 100:  # Assume it's in pesos if less than 100
            amount_centavos = int(amount * 100)
        else:
            amount_centavos = int(amount)
        
        payload = {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "currency": currency,
                    "description": description,
                    "payment_method_allowed": [
                        "card",
                        "gcash",
                        "grab_pay",
                        "paymaya"
                    ],
                    "capture_type": "automatic"
                }
            }
        }
        
        if metadata:
            payload["data"]["attributes"]["metadata"] = metadata
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo API Error: {e}")
            if hasattr(e.response, 'text'):
                print(f"Response: {e.response.text}")
            return {"error": str(e)}
    
    def create_payment_method(self, payment_intent_id, payment_method_type="card", details=None):
        """
        Create a payment method for the payment intent
        """
        url = f"{self.base_url}/payment_methods"
        
        payload = {
            "data": {
                "attributes": {
                    "type": payment_method_type
                }
            }
        }
        
        if details and payment_method_type == "card":
            payload["data"]["attributes"]["details"] = details
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo Payment Method Error: {e}")
            return {"error": str(e)}
    
    def attach_payment_intent(self, payment_intent_id, payment_method_id, client_key=None):
        """
        Attach payment method to payment intent
        """
        url = f"{self.base_url}/payment_intents/{payment_intent_id}/attach"
        
        payload = {
            "data": {
                "attributes": {
                    "payment_method": payment_method_id
                }
            }
        }
        
        if client_key:
            payload["data"]["attributes"]["client_key"] = client_key
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo Attach Error: {e}")
            return {"error": str(e)}
    
    def create_source(self, amount, payment_type="gcash", currency="PHP", redirect_urls=None):
        """
        Create a PayMongo Source for e-wallet payments
        Amount should be in pesos (will be converted to centavos)
        """
        url = f"{self.base_url}/sources"
        
        # Convert amount to centavos - ensure it's an integer
        amount_centavos = int(float(amount) * 100)
        
        # PayMongo minimum is 100 PHP (10000 centavos)
        if amount_centavos < 10000:
            return {"error": "Amount must be at least ₱100.00"}
        
        # Default redirect URLs if not provided
        default_redirect = {
            "success": "http://localhost:5000/payment/success",
            "failed": "http://localhost:5000/payment/failed"
        }
        
        payload = {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "currency": currency,
                    "type": payment_type,
                    "redirect": redirect_urls if redirect_urls else default_redirect
                }
            }
        }
        
        try:
            print(f"Creating PayMongo source with payload: {json.dumps(payload, indent=2)}")
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            result = response.json()
            print(f"PayMongo source created successfully: {result.get('data', {}).get('id')}")
            return result
        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_detail = e.response.json()
                    print(f"PayMongo Source Error Details: {json.dumps(error_detail, indent=2)}")
                    error_msg = error_detail.get('errors', [{}])[0].get('detail', str(e))
                except:
                    error_msg = e.response.text
            print(f"PayMongo Source Error: {error_msg}")
            return {"error": error_msg}
    
    def get_payment_intent(self, payment_intent_id):
        """
        Retrieve payment intent details
        """
        url = f"{self.base_url}/payment_intents/{payment_intent_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo Get Payment Intent Error: {e}")
            return {"error": str(e)}
    
    def get_source(self, source_id):
        """
        Retrieve source details
        """
        url = f"{self.base_url}/sources/{source_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo Get Source Error: {e}")
            return {"error": str(e)}
    
    def verify_webhook(self, payload_body, signature_header):
        """
        Verify PayMongo webhook signature
        """
        if not self.webhook_secret:
            return False
        
        try:
            # PayMongo uses HMAC-SHA256 for webhook signatures
            expected_signature = hmac.new(
                self.webhook_secret.encode('utf-8'),
                payload_body.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            # PayMongo signature format: "t=timestamp,paymongo-signature=signature"
            signature_parts = {}
            for part in signature_header.split(','):
                if '=' in part:
                    key, value = part.split('=', 1)
                    signature_parts[key.strip()] = value.strip()
            
            received_signature = signature_parts.get('paymongo-signature', '')
            
            return hmac.compare_digest(expected_signature, received_signature)
        except Exception as e:
            print(f"Webhook verification error: {e}")
            return False
    
    def create_webhook(self, url, events=None):
        """
        Create a PayMongo webhook endpoint
        """
        webhook_url = f"{self.base_url}/webhooks"
        
        if events is None:
            events = [
                "payment_intent.payment_failed",
                "payment_intent.succeeded",
                "source.chargeable",
                "payment.paid",
                "payment.failed"
            ]
        
        payload = {
            "data": {
                "attributes": {
                    "url": url,
                    "events": events
                }
            }
        }
        
        try:
            response = requests.post(webhook_url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"PayMongo Webhook Creation Error: {e}")
            return {"error": str(e)}
    
    def get_payment_status(self, payment_id, payment_type="payment_intent"):
        """
        Get payment status - works for both payment intents and sources
        """
        if payment_type == "source":
            return self.get_source(payment_id)
        else:
            return self.get_payment_intent(payment_id)
    
    def format_amount_for_display(self, amount_centavos):
        """
        Convert centavos back to peso format for display
        """
        return amount_centavos / 100
    
    def validate_amount(self, amount, min_amount=1.00):
        """
        Validate payment amount
        """
        if amount < min_amount:
            return False, f"Amount must be at least ₱{min_amount}"
        
        if amount > 100000:  # PayMongo limit
            return False, "Amount exceeds maximum limit of ₱100,000"
        
        return True, "Amount is valid"


# Utility function to create service instance from environment
def create_paymongo_service():
    """
    Create PayMongo service instance from environment variables
    """
    secret_key = os.getenv('PAYMONGO_SECRET_KEY')
    public_key = os.getenv('PAYMONGO_PUBLIC_KEY')
    webhook_secret = os.getenv('PAYMONGO_WEBHOOK_SECRET')
    
    if not secret_key or not public_key:
        raise ValueError("PayMongo API keys are not configured in environment variables")
    
    return PayMongoService(secret_key, public_key, webhook_secret)