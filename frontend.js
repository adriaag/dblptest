// Updated frontend code that works with slugs array

document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.getElementById("publications-table-body");
    const paginationContainer = document.getElementById("pagination");
    const resultsInfo = document.getElementById("results-info");
    const loadingSpinner = document.querySelector(".loading-spinner");
    const tableResponsive = document.querySelector(".table-responsive");

    const emailDictionary = {
        "achraf-hmimou": "achraf.hmimou@upc.edu",
        "besim-bilalli": "besim.bilalli@upc.edu",
        "javier-de-jesus-flores-herrera": "javier.flores@upc.edu",
        "petar-jovanovic": "petar.jovanovic@upc.edu",
        "sergi-nadal": "sergi.nadal@upc.edu",
        "oscar-romero": "oscar.romero@upc.edu",
        "aniol-bisquert": "aniol.bisquert@upc.edu",
        "anna-queralt": "anna.queralt@upc.edu",
        "gerard-pons": "gerard.pons.recasens@upc.edu",
        "marc-maynou": "marc.maynou@upc.edu",
        "md-ataur-rahman": "md.ataur.rahman@upc.edu",
        "uchechukwu-njoku": "uchechukwu.fortune.njoku@upc.edu",
        "yeasmin-ara": "yeasmin.ara.akter@upc.edu",
        "jose-norberto-mazon-1": "jose.norberto.mazon@upc.edu",
        "albert-martin": "albert.martin.g@upc.edu"
    };

    let itemsPerPage = 10;
    let currentPage = 1;
    let publications = [];

    const getLastSegment = () => {
        const url = window.location.pathname;
        const segments = url.split("/").filter(Boolean);
        return segments[segments.length - 1];
    };

    const renderPage = (page) => {
        tableBody.innerHTML = "";
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = publications.slice(start, end);

        paginatedItems.forEach(pub => {
            const row = document.createElement("tr");
            
            const lastSegment = getLastSegment();
            const isPublicationsPage = lastSegment === "publications";
            
            // Check if this is the primary author for styling
            const isPrimaryAuthor = pub.primarySlug === lastSegment;
            
            row.innerHTML = `
                <td>
                    ${pub.year}
                    ${!isPublicationsPage && isPrimaryAuthor ? '<br><small class="badge bg-primary">Primary</small>' : ''}
                </td>
                <td>
                    <a href="${pub.url}" class="publication-link" target="_blank" rel="noopener noreferrer">
                        ${pub.title}
                    </a><br>
                    <small class="text-muted">${pub.authors}</small><br>
                    ${!isPublicationsPage ? `<small class="text-info">Contributors: ${pub.slugs.join(', ')}</small>` : ''}
                </td>
                <td class="d-none d-md-table-cell">${pub.venue}</td>
            `;
            
            // Add special styling for primary author publications
            if (!isPublicationsPage && isPrimaryAuthor) {
                row.classList.add('table-primary');
            }
            
            tableBody.appendChild(row);
        });

        resultsInfo.textContent = `Showing ${start + 1} to ${Math.min(end, publications.length)} of ${publications.length} publications`;
    };

    const renderPagination = () => {
        paginationContainer.innerHTML = "";
        const totalPages = Math.ceil(publications.length / itemsPerPage);

        if (totalPages <= 1) return;

        const prevButton = document.createElement("button");
        prevButton.className = `btn btn-outline-primary ${currentPage === 1 ? 'disabled' : ''}`;
        prevButton.innerHTML = '&laquo; Previous';
        prevButton.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderPage(currentPage);
                renderPagination();
            }
        };
        paginationContainer.appendChild(prevButton);

        // Show page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement("button");
            pageButton.className = `btn ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
            pageButton.textContent = i;
            pageButton.onclick = () => {
                currentPage = i;
                renderPage(currentPage);
                renderPagination();
            };
            paginationContainer.appendChild(pageButton);
        }

        const nextButton = document.createElement("button");
        nextButton.className = `btn btn-outline-primary ${currentPage === totalPages ? 'disabled' : ''}`;
        nextButton.innerHTML = 'Next &raquo;';
        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderPage(currentPage);
                renderPagination();
            }
        };
        paginationContainer.appendChild(nextButton);
    };

    const insertEmail = (lastSegment) => {
        if (emailDictionary[lastSegment]) {
            const realEmail = emailDictionary[lastSegment];
            const displayedEmail = realEmail.replace('@', '[at]').replace(/\./g, '[dot]');
            document.getElementById("contact-email").innerHTML = `
                <a href="#" onclick="window.location.href='mailto:${realEmail}'; return false;">
                    ${displayedEmail}
                </a>
            `;
        }
    };

    const loadPublications = async () => {
        loadingSpinner.style.display = 'block';
        tableResponsive.style.display = 'none';

        const lastSegment = getLastSegment();
        const isPublicationsPage = lastSegment === "publications";

        const fileURL = "https://dtim.upc.edu/en/all-publications.json/@@download/file/all-publications.json";

        try {
            const response = await fetch(fileURL);
            if (!response.ok) throw new Error("Failed to fetch merged publication file");

            const data = await response.json();
            let allPublicationsRaw = data.publications || [];

            // Simple deduplication by title+year (fallback for old format)
            const seen = new Set();
            allPublicationsRaw = allPublicationsRaw.filter(pub => {
                const key = `${pub.title.toLowerCase().trim()}|${pub.year}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            if (!isPublicationsPage) {
                // For individual person pages: filter by slugs array
                itemsPerPage = 5;
                publications = allPublicationsRaw.filter(pub => {
                    // Handle both old format (single slug) and new format (slugs array)
                    if (pub.slugs && Array.isArray(pub.slugs)) {
                        return pub.slugs.includes(lastSegment);
                    } else if (pub.slug) {
                        // Fallback for old format
                        return pub.slug === lastSegment;
                    }
                    return false;
                });
                
                // Sort to show primary author papers first
                publications.sort((a, b) => {
                    const aIsPrimary = (a.primarySlug || a.slug) === lastSegment;
                    const bIsPrimary = (b.primarySlug || b.slug) === lastSegment;
                    
                    if (aIsPrimary && !bIsPrimary) return -1;
                    if (!aIsPrimary && bIsPrimary) return 1;
                    
                    // Then sort by year
                    if (b.year !== a.year) return b.year - a.year;
                    if (b.month !== a.month) return b.month - a.month;
                    return b.day - a.day;
                });
            } else {
                // For main publications page: show all
                itemsPerPage = 10;
                publications = allPublicationsRaw;
                
                publications.sort((a, b) => {
                    if (b.year !== a.year) return b.year - a.year;
                    if (b.month !== a.month) return b.month - a.month;
                    return b.day - a.day;
                });
            }

        } catch (error) {
            console.error("Error loading all-publications.json", error);
            publications = [];
        }

        renderPage(currentPage);
        renderPagination();
        insertEmail(lastSegment);

        loadingSpinner.style.display = 'none';
        tableResponsive.style.display = 'block';
    };

    loadPublications();
});
