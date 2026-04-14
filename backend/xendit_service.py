import requests
import uuid
import base64

class XenditService:
    def __init__(self, secret_key, public_key=None):
        self.secret_key = secret_key
        self.public_key = public_key
        self.base_url = "https://api.xendit.co"
        
        # Create proper Basic Auth header
        auth_string = f"{self.secret_key}:"
        auth_bytes = auth_string.encode('ascii')
        base64_auth = base64.b64encode(auth_bytes).decode('ascii')
        
        self.headers = {
            "Authorization": f"Basic {base64_auth}",
            "Content-Type": "application/json"
        }

    def create_payment_request(self, amount, currency="PHP", description="Payment",
                         reference_id=None, success_redirect_url=None,
                         failure_redirect_url=None):
        if not reference_id:
            reference_id = f"order_{uuid.uuid4().hex[:8]}"

        try:
            url = f"{self.base_url}/v2/invoices"
            
            payload = {
                "external_id": reference_id,
                "amount": amount,
                "currency": currency,
                "description": description,
                "failure_redirect_url": failure_redirect_url,
                "success_redirect_url": success_redirect_url,
                "payment_methods": ["GCASH", "CREDIT_CARD"]
            }

            response = requests.post(url, json=payload, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            return {
                "success": True,
                "checkout_url": data.get('invoice_url'),
                "invoice_id": data.get('id')
            }
                    
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_message = error_data.get('message', str(e))
                except ValueError:
                    error_message = str(e)
            else:
                error_message = str(e)
            raise Exception(f"Failed to create payment request: {error_message}")

    def verify_webhook(self, webhook_token, expected_token):
        """Verify webhook authenticity"""
        return webhook_token == expected_token

    def get_payment_status(self, payment_id, payment_type='payment_request'):
        """Get payment status"""
        try:
            if payment_type == 'payment_request':
                url = f"{self.base_url}/v2/invoices/{payment_id}"
            else:
                url = f"{self.base_url}/credit_card_charges/{payment_id}"
                
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            return data.get('status')
        except Exception as e:
            raise Exception(f"Failed to get payment status: {str(e)}")
    
    def create_refund(self, payment_id, amount, reason="Customer request", reference_id=None):
        """Create a refund for a payment"""
        try:
            if not reference_id:
                reference_id = f"refund_{uuid.uuid4().hex[:8]}"
            
            # For invoices, we need to create a refund via the disbursement API
            url = f"{self.base_url}/v2/invoices/{payment_id}/refund"
            
            payload = {
                "amount": amount,
                "reason": reason,
                "reference_id": reference_id
            }
            
            response = requests.post(url, json=payload, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            return {
                "success": True,
                "refund_id": data.get('id'),
                "status": data.get('status'),
                "amount": data.get('amount')
            }
        
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_message = error_data.get('message', str(e))
                except ValueError:
                    error_message = str(e)
            else:
                error_message = str(e)
            raise Exception(f"Failed to create refund: {error_message}")
    
    def get_refund_status(self, refund_id):
        """Get refund status"""
        try:
            url = f"{self.base_url}/v2/refunds/{refund_id}"
            
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            return {
                "status": data.get('status'),
                "amount": data.get('amount'),
                "created": data.get('created')
            }
        except Exception as e:
            raise Exception(f"Failed to get refund status: {str(e)}")
