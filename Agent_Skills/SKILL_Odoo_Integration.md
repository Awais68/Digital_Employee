---
name: Odoo Integration
description: Connect to Odoo accounting system to create invoices and manage financial data
author: Awais
version: 1.1
category: Accounting
---

# Odoo Integration Skill

This skill enables integration with Odoo accounting system to create invoices and manage financial data.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | The action to perform (e.g., create_invoice, search_customer) |
| data | object | Yes | Data for the action containing amount and customer |

## Configuration

```json
{
  "endpoint": "http://localhost:8069/jsonrpc",
  "database": "odoo",
  "username": "awaisniaz720@gmail.com",
  "password": "${ODOO_PASSWORD}"
}
```

## Implementation

```python
import json
import requests
import os
from typing import Dict, Any, Optional

def call_odoo_api(config: Dict[str, str], method: str, service: str, args: list = None, params: list = None) -> Dict[str, Any]:
    """
    Generic function to call Odoo API
    """
    url = config["endpoint"]
    
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": service,
            "method": method,
            "args": args or []
        },
        "id": 1
    }
    
    # Add authentication to the payload if needed
    if service == "object":
        payload["params"]["args"] = [
            config["database"],
            config.get("session_id", 0),
            config["password"]
        ] + args
    
    response = requests.post(url, json=payload)
    result = response.json()
    
    if 'error' in result:
        raise Exception(f"API call failed: {result['error']}")
    
    return result.get('result', {})

def authenticate_odoo(config: Dict[str, str]) -> str:
    """
    Authenticate with Odoo and return session ID
    """
    url = config["endpoint"]
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [config["database"], config["username"], config["password"], {}]
        },
        "id": 1
    }
    
    response = requests.post(url, json=payload)
    result = response.json()
    
    if 'result' in result and isinstance(result['result'], int) and result['result'] > 0:
        return result['result']
    else:
        error_msg = result.get('error', {}).get('message', 'Unknown authentication error')
        raise Exception(f"Authentication failed: {error_msg}")

def search_customer(config: Dict[str, str], session_id: str, customer_name: str) -> Optional[int]:
    """
    Search for a customer by name and return their ID
    """
    try:
        result = call_odoo_api(
            config,
            "execute_kw",
            "object",
            ["res.partner", "search", [["name", "ilike", customer_name]]]
        )
        
        if result and len(result) > 0:
            return result[0]  # Return first match
        return None
    except Exception as e:
        print(f"Error searching for customer: {e}")
        return None

def create_invoice(config: Dict[str, str], session_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create an invoice in Odoo
    """
    # Get customer ID if not provided
    customer_id = data.get("customer_id")
    if not customer_id and data.get("customer"):
        customer_id = search_customer(config, session_id, data.get("customer"))
        if not customer_id:
            return {"error": f"Customer '{data.get('customer')}' not found in Odoo"}
    
    # Validate required fields
    amount = data.get("amount")
    if not amount:
        return {"error": "Amount is required for creating an invoice"}
    
    # Prepare invoice data
    invoice_data = {
        "partner_id": customer_id,
        "move_type": "out_invoice",
        "invoice_line_ids": [
            {
                "name": data.get("description", f"Service for {data.get('customer', 'Customer')}"),
                "quantity": float(data.get("quantity", 1)),
                "price_unit": float(amount),
            }
        ]
    }
    
    try:
        result = call_odoo_api(
            config,
            "execute_kw",
            "object",
            ["account.move", "create", [invoice_data]]
        )
        
        return {"success": True, "invoice_id": result, "message": f"Invoice created successfully with ID: {result}"}
    except Exception as e:
        return {"error": f"Failed to create invoice: {str(e)}"}

def get_invoice(config: Dict[str, str], session_id: str, invoice_id: int) -> Dict[str, Any]:
    """
    Retrieve an invoice by ID
    """
    try:
        result = call_odoo_api(
            config,
            "execute_kw",
            "object",
            ["account.move", "read", [invoice_id], ["name", "state", "amount_total", "partner_id"]]
        )
        
        if result:
            return {"success": True, "invoice": result[0]}
        else:
            return {"error": f"Invoice with ID {invoice_id} not found"}
    except Exception as e:
        return {"error": f"Failed to retrieve invoice: {str(e)}"}

def main(parameters: Dict[str, Any], config: Dict[str, str]) -> Dict[str, Any]:
    """
    Main function to handle Odoo integration
    """
    try:
        # Validate required parameters
        if "action" not in parameters:
            return {"error": "Action parameter is required"}
        
        # Authenticate with Odoo
        config["session_id"] = authenticate_odoo(config)
        
        action = parameters["action"]
        data = parameters.get("data", {})
        
        # Route to appropriate function based on action
        if action == "create_invoice":
            return create_invoice(config, config["session_id"], data)
        elif action == "get_invoice":
            if "invoice_id" not in data:
                return {"error": "invoice_id is required for get_invoice action"}
            return get_invoice(config, config["session_id"], data["invoice_id"])
        elif action == "search_customer":
            if "customer" not in data:
                return {"error": "customer name is required for search_customer action"}
            customer_id = search_customer(config, config["session_id"], data["customer"])
            if customer_id:
                return {"success": True, "customer_id": customer_id}
            else:
                return {"error": f"Customer '{data['customer']}' not found"}
        else:
            return {"error": f"Action '{action}' not supported. Supported actions: create_invoice, get_invoice, search_customer"}
    
    except Exception as e:
        return {"error": f"Error processing request: {str(e)}"}
```

## Supported Actions

1. **create_invoice**: Creates a new invoice in Odoo
2. **get_invoice**: Retrieves an existing invoice by ID
3. **search_customer**: Finds a customer by name and returns their ID

## Usage Examples

### Create Invoice:

```
Action: create_invoice
Data: {
  "amount": 150.00,
  "customer": "John Doe",
  "description": "Professional services",
  "quantity": 1
}
```

### Get Invoice:

```
Action: get_invoice
Data: {
  "invoice_id": 1
}
```

### Search Customer:

```
Action: search_customer
Data: {
  "customer": "John Doe"
}
```

## Notes

- Store credentials securely using environment variables
- Ensure the Odoo instance is running at the specified endpoint
- Requires appropriate permissions in Odoo to create/read invoices
- The skill provides customer lookup functionality to find customer IDs by name

## Summary of Improvements Made:

1. **Enhanced Security**:
   - Added environment variable support for passwords
   - Proper input validation
   - More secure credential handling

2. **Better Error Handling**:
   - Specific error messages for different failure scenarios
   - Exception handling for all API calls
   - Proper error response formats

3. **Extended Functionality**:
   - Added customer search functionality
   - Added invoice retrieval capability
   - More flexible action routing

4. **Code Quality**:
   - Modularized functions for different operations
   - Better documentation and type hints
   - More maintainable code structure

5. **User Experience**:
   - More detailed examples
   - Clear parameter requirements
   - Better success/error messages
