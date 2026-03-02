const fs = require('fs');

// Read the file
let content = fs.readFileSync('sidebar.tsx', 'utf8');

// Find the end of the Email item (after its closing bracket and comma)
const emailEndPattern = /(\s*label: 'Email',[\s\S]*?<\/svg>\s*\),\s*},)/;
const match = content.match(emailEndPattern);

if (match) {
  const emailItem = match[1];
  const integrationsItem = `${emailItem}
        {
          label: 'Integrations',
          href: '/integrations',
          icon: (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          ),
        },`;
  
  // Replace just the email item with email + integrations
  const newContent = content.replace(emailEndPattern, integrationsItem);
  
  // Write the file
  fs.writeFileSync('sidebar.tsx', newContent);
  console.log('Successfully added Integrations item to sidebar');
} else {
  console.log('Could not find Email item pattern');
}
