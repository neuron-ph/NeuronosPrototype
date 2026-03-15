import { apiFetch } from "./api";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  [key: string]: any;
}

interface Customer {
  id: string;
  company_name: string;
  industry: string;
  registered_address: string;
  [key: string]: any;
}

export async function cleanupDuplicates() {
  console.log("🧹 Starting cleanup of duplicate contacts and customers...");
  
  try {
    let deletedContacts = 0;
    let deletedCustomers = 0;

    // ==================== CLEANUP CONTACTS ====================
    console.log("\n📞 Fetching all contacts...");
    const contactsResponse = await apiFetch('/contacts', {
      method: "GET",
    });

    const contactsResult = await contactsResponse.json();
    
    if (contactsResult.success && contactsResult.data) {
      const contacts: Contact[] = contactsResult.data;
      console.log(`Found ${contacts.length} total contacts`);

      // Group contacts by email (unique identifier)
      const contactsByEmail = new Map<string, Contact[]>();
      
      contacts.forEach(contact => {
        const key = contact.email.toLowerCase().trim();
        if (!contactsByEmail.has(key)) {
          contactsByEmail.set(key, []);
        }
        contactsByEmail.get(key)!.push(contact);
      });

      // Find and delete duplicates (keep the first one)
      for (const [email, duplicates] of contactsByEmail.entries()) {
        if (duplicates.length > 1) {
          console.log(`\n🔍 Found ${duplicates.length} duplicates for email: ${email}`);
          
          // Keep the first one, delete the rest
          const toDelete = duplicates.slice(1);
          
          for (const contact of toDelete) {
            console.log(`   ❌ Deleting duplicate: ${contact.name} (ID: ${contact.id})`);
            
            const deleteResponse = await apiFetch(`/contacts/${contact.id}`, {
              method: "DELETE",
            });

            const deleteResult = await deleteResponse.json();
            if (deleteResult.success) {
              deletedContacts++;
              console.log(`   ✅ Deleted successfully`);
            } else {
              console.error(`   ⚠️ Failed to delete: ${deleteResult.error}`);
            }
          }
        }
      }
    }

    // ==================== CLEANUP CUSTOMERS ====================
    console.log("\n\n🏢 Fetching all customers...");
    const customersResponse = await apiFetch('/customers', {
      method: "GET",
    });

    const customersResult = await customersResponse.json();
    
    if (customersResult.success && customersResult.data) {
      const customers: Customer[] = customersResult.data;
      console.log(`Found ${customers.length} total customers`);

      // Group customers by company_name (unique identifier)
      const customersByCompany = new Map<string, Customer[]>();
      
      customers.forEach(customer => {
        const key = customer.company_name.toLowerCase().trim();
        if (!customersByCompany.has(key)) {
          customersByCompany.set(key, []);
        }
        customersByCompany.get(key)!.push(customer);
      });

      // Find and delete duplicates (keep the first one)
      for (const [companyName, duplicates] of customersByCompany.entries()) {
        if (duplicates.length > 1) {
          console.log(`\n🔍 Found ${duplicates.length} duplicates for company: ${companyName}`);
          
          // Keep the first one, delete the rest
          const toDelete = duplicates.slice(1);
          
          for (const customer of toDelete) {
            console.log(`   ❌ Deleting duplicate: ${customer.company_name} (ID: ${customer.id})`);
            
            const deleteResponse = await apiFetch(`/customers/${customer.id}`, {
              method: "DELETE",
            });

            const deleteResult = await deleteResponse.json();
            if (deleteResult.success) {
              deletedCustomers++;
              console.log(`   ✅ Deleted successfully`);
            } else {
              console.error(`   ⚠️ Failed to delete: ${deleteResult.error}`);
            }
          }
        }
      }
    }

    // ==================== SUMMARY ====================
    console.log("\n\n✨ CLEANUP COMPLETE!");
    console.log(`📊 Summary:`);
    console.log(`   • Deleted ${deletedContacts} duplicate contacts`);
    console.log(`   • Deleted ${deletedCustomers} duplicate customers`);
    console.log(`   • Total duplicates removed: ${deletedContacts + deletedCustomers}`);
    
    return {
      success: true,
      deletedContacts,
      deletedCustomers,
      totalDeleted: deletedContacts + deletedCustomers
    };

  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    return {
      success: false,
      error: String(error)
    };
  }
}