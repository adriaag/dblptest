const fs = require('fs');
const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');
const path = require('path');
const fsprom = require('node:fs/promises');

// Load configuration
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Extract dictionaries from config
const personDictionary = {};
const yearDictionary = {};
const nameVariationsMap = {};

Object.entries(config.authors).forEach(([slug, author]) => {
    if (author.dblpId) {
        personDictionary[slug] = author.dblpId;
        yearDictionary[slug] = author.minYear;
        nameVariationsMap[slug] = author.nameVariations;
    }
});

function getPersonNameVariations(personKey) {
    return nameVariationsMap[personKey] || [personKey.replace(/-/g, ' ')];
}

// Function to fetch XML data from DBLP
async function readXML(personID) {
    const safeID = personID.replace(/\//g, "_")
    const filePath = path.join(
        __dirname,
        '../publications',
        `${safeID}.xml`
    );

    return await fsprom.readFile(filePath, 'utf8');
}

// Function to parse publications from XML
function parsePublications(xmlData, minYear = 2000) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'application/xml');
    
    // Check for parsing errors
    const parserErrors = xmlDoc.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
        throw new Error('XML parsing failed');
    }
    
    const publications = [];
    
    // Get both conference papers and journal articles
    const nodes = [
        ...Array.from(xmlDoc.getElementsByTagName('inproceedings')),
        ...Array.from(xmlDoc.getElementsByTagName('article'))
    ];
    
    nodes.forEach(pub => {
        try {
            const title = pub.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
            const year = parseInt(pub.getElementsByTagName('year')[0]?.textContent || '0', 10);
            const month = parseInt(pub.getElementsByTagName('month')[0]?.textContent || '0', 10);
            const day = parseInt(pub.getAttribute('mdate')?.split('-')[2] || '0', 10);
            
            if (year < minYear || year === 0) return;
            
            // Get authors
            const authors = Array.from(pub.getElementsByTagName('author'))
                .map(author => author.textContent.replace(/\s+\d+$/, '').trim())
                .filter(author => author.length > 0)
                .join(', ');
            
            // Get venue (conference or journal)
            const venue = pub.getElementsByTagName('booktitle')[0]?.textContent?.trim() ||
                          pub.getElementsByTagName('journal')[0]?.textContent?.trim() ||
                          'Unknown Venue';
            
            // Get URL
            const url = pub.getElementsByTagName('ee')[0]?.textContent?.trim() ||
                        pub.getElementsByTagName('url')[0]?.textContent?.trim() ||
                        '#';
            
            // Get pages
            const pages = pub.getElementsByTagName('pages')[0]?.textContent?.trim() || 'Unknown';
            
            publications.push({
                title,
                year,
                month,
                day,
                authors,
                venue,
                url,
                pages
            });
            
        } catch (error) {
            console.warn('Error parsing publication:', error.message);
        }
    });
    
    // Sort by year (newest first), then by month, then by day
    return publications.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (b.month !== a.month) return b.month - a.month;
        return b.day - a.day;
    });
}

// Main function to fetch all publications
async function fetchAllPublications() {
    console.log('🚀 Starting DBLP publications fetch...');
    
    const allPublications = [];
    const individualFiles = {};
    
    // Process each person
    for (const [personKey, personID] of Object.entries(personDictionary)) {
        try {
            console.log(`\n📚 Processing ${personKey} (${personID})...`);
            
            //const url = `https://dblp.org/pid/${personID}.xml`;
            const xmlData = await readXML(personID)
            console.log(xmlData)
            const minYear = yearDictionary[personKey] || 2000;

            let publications = parsePublications(xmlData, minYear);

            // Attach slug to each publication - determine primary author
            publications = publications.map(pub => {
                // Simple heuristic: assign slug to the first author in the author list
                // if the current person is the first author, otherwise use existing logic
                const authorList = pub.authors.split(', ').map(a => a.trim());
                const currentPersonNames = getPersonNameVariations(personKey);
                
                // Check if current person is first author
                const isFirstAuthor = currentPersonNames.some(name => 
                    authorList[0] && authorList[0].toLowerCase().includes(name.toLowerCase())
                );
                
                return {
                    ...pub,
                    slug: personKey,
                    isFirstAuthor: isFirstAuthor
                };
            });
            
            const firstAuthorCount = publications.filter(p => p.isFirstAuthor).length;
            console.log(`   ✓ Found ${publications.length} publications (${firstAuthorCount} as first author)`);
            
            // Save individual file (remove isFirstAuthor flag)
            const cleanPublications = publications.map(({ isFirstAuthor, ...pub }) => pub);
            individualFiles[personKey] = {
                publications: cleanPublications,
                lastUpdated: new Date().toISOString(),
                personID,
                minYear
            };
            
            // Add to all publications
            allPublications.push(...publications);
            
            // Be nice to DBLP servers
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`   ✗ Failed to process ${personKey}:`, error.message);
            
            // Create empty file for failed fetches
            individualFiles[personKey] = {
                publications: [],
                lastUpdated: new Date().toISOString(),
                personID: personDictionary[personKey],
                error: error.message
            };
        }
    }
    
    // Remove duplicates and collect contributing authors
    console.log('\n🔄 Removing duplicates...');
    const publicationMap = new Map();
    
    allPublications.forEach(pub => {
        const key = `${pub.title.toLowerCase().trim()}|${pub.year}|${pub.authors.toLowerCase()}`;
        if (!publicationMap.has(key)) {
            publicationMap.set(key, []);
        }
        publicationMap.get(key).push(pub);
    });
    
    const uniquePublications = [];
    for (const [key, pubs] of publicationMap) {
        const allSlugs = [...new Set(pubs.map(p => p.slug))];
        
        // Pick primary author (first author has priority)
        pubs.sort((a, b) => {
            if (a.isFirstAuthor && !b.isFirstAuthor) return -1;
            if (!a.isFirstAuthor && b.isFirstAuthor) return 1;
            return a.slug.localeCompare(b.slug);
        });
        
        const primary = pubs[0];
        const { isFirstAuthor, slug, ...pubData } = primary;
        
        uniquePublications.push({
            ...pubData,
            slugs: allSlugs,
            primarySlug: primary.slug
        });
        
        if (pubs.length > 1) {
            console.log(`   📝 "${primary.title.substring(0, 50)}..." contributors: [${allSlugs.join(', ')}]`);
        }
    }
    
    // Sort all publications
    uniquePublications.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (b.month !== a.month) return b.month - a.month;
        return b.day - a.day;
    });
    
    console.log(`📊 Total unique publications: ${uniquePublications.length}`);
    
    // Show slug distribution (count contributions by each author)
    const slugCounts = {};
    const primarySlugCounts = {};
    
    uniquePublications.forEach(pub => {
        // Count all contributions
        pub.slugs.forEach(slug => {
            slugCounts[slug] = (slugCounts[slug] || 0) + 1;
        });
        
        // Count primary authorships
        primarySlugCounts[pub.primarySlug] = (primarySlugCounts[pub.primarySlug] || 0) + 1;
    });
    
    console.log('\n📈 Total publications by author (including co-authorships):');
    Object.entries(slugCounts).sort((a, b) => b[1] - a[1]).forEach(([slug, count]) => {
        console.log(`   ${slug}: ${count}`);
    });
    
    console.log('\n🎯 Primary authorships (papers assigned to author as primary):');
    Object.entries(primarySlugCounts).sort((a, b) => b[1] - a[1]).forEach(([slug, count]) => {
        console.log(`   ${slug}: ${count}`);
    });
    
    return { individualFiles, allPublications: uniquePublications };
}

// Save data to files
async function saveData() {
    try {
        const { individualFiles, allPublications } = await fetchAllPublications();
        
        console.log('\n💾 Saving files...');
        
        // Ensure data directory exists
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data', { recursive: true });
        }
        
        // Save individual files
        for (const [personKey, data] of Object.entries(individualFiles)) {
            const filename = `data/${personKey}.json`;
            const fileData = {
                publications: data.publications,
                metadata: {
                    lastUpdated: data.lastUpdated,
                    personID: data.personID,
                    minYear: data.minYear,
                    count: data.publications.length,
                    ...(data.error && { error: data.error })
                }
            };
            
            fs.writeFileSync(filename, JSON.stringify(fileData, null, 2));
            console.log(`   ✓ Saved ${filename} (${data.publications.length} publications)`);
        }
        
        // Save merged file
        const allData = {
            publications: allPublications,
            metadata: {
                generatedAt: new Date().toISOString(),
                totalAuthors: Object.keys(individualFiles).length,
                totalPublications: allPublications.length
            }
        };
        fs.writeFileSync('data/all-publications.json', JSON.stringify(allData, null, 2));
        console.log(`   ✓ Saved data/all-publications.json (${allPublications.length} publications total)`);
        
        console.log('\n🎉 All files saved successfully!');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script if called directly
if (require.main === module) {
    saveData();
}

// Export functions for testing
module.exports = {
    fetchAllPublications,
    saveData,
    getPersonNameVariations,
    parsePublications,
    readXML,
    personDictionary,
    yearDictionary
};
