// Admin Reports JavaScript
(function() {
    let salesChart, usersChart, ordersChart, revenueChart;
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
        initializeReports();
    });
    
    function initializeReports() {
        // Set default date range (last 30 days)
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);
        
        document.getElementById('dateTo').value = dateTo.toISOString().split('T')[0];
        document.getElementById('dateFrom').value = dateFrom.toISOString().split('T')[0];
        
        // Event listeners
        document.getElementById('updateReportsBtn').addEventListener('click', loadReports);
        document.getElementById('resetDateBtn').addEventListener('click', function() {
            const dateTo = new Date();
            const dateFrom = new Date();
            dateFrom.setDate(dateFrom.getDate() - 30);
            document.getElementById('dateTo').value = dateTo.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = dateFrom.toISOString().split('T')[0];
            loadReports();
        });
        
        // Load initial reports
        loadReports();
    }
    
    async function loadReports() {
        const loadingState = document.getElementById('loadingState');
        const reportsContent = document.getElementById('reportsContent');
        
        loadingState.style.display = 'block';
        reportsContent.style.display = 'none';
        
        try {
            const token = getAuthToken();
            if (!token) {
                alert('Please log in to view reports');
                return;
            }
            
            const dateFrom = document.getElementById('dateFrom').value;
            const dateTo = document.getElementById('dateTo').value;
            
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            
            const response = await fetch(`/api/admin/reports?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            let errorMessage = 'Failed to load reports';
            
            if (!response.ok) {
                // Try to get error message from response
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
                    console.error('API Error:', errorData);
                } catch (e) {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            console.log('Reports data received:', data);
            
            if (data.success && data.reports) {
                updateReports(data.reports);
                loadingState.style.display = 'none';
                reportsContent.style.display = 'block';
            } else {
                throw new Error(data.error || 'Invalid response format');
            }
        } catch (error) {
            console.error('Error loading reports:', error);
            const errorMsg = error.message || 'Failed to load reports. Please try again.';
            loadingState.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444;"></i>
                    <p style="margin-top: 1rem; color: var(--gray-600); font-weight: 600;">${escapeHtml(errorMsg)}</p>
                    <p style="margin-top: 0.5rem; color: var(--gray-500); font-size: 0.85rem;">Check the browser console (F12) for more details.</p>
                    <button class="btn-primary" onclick="loadReports()" style="margin-top: 1rem;">Retry</button>
                </div>
            `;
        }
    }
    
    function updateReports(reports) {
        // Update summary stats
        updateSummaryStats(reports);
        
        // Update sales report
        updateSalesReport(reports.sales);
        
        // Update user analytics
        updateUserAnalytics(reports.users);
        
        // Update order statistics
        updateOrderStatistics(reports.orders);
        
        // Update revenue report
        updateRevenueReport(reports.revenue);
        
        // Update seller performance
        updateSellerPerformance(reports.sellers);
        
        // Update rider performance
        updateRiderPerformance(reports.riders);
    }
    
    function updateSummaryStats(reports) {
        document.getElementById('totalSales').textContent = formatCurrency(reports.sales.total_sales);
        document.getElementById('totalUsers').textContent = reports.users.total_users.toLocaleString();
        document.getElementById('totalOrders').textContent = reports.sales.total_orders.toLocaleString();
        document.getElementById('totalRevenue').textContent = formatCurrency(reports.revenue.total_revenue);
    }
    
    function updateSalesReport(sales) {
        document.getElementById('salesTotal').textContent = formatCurrency(sales.total_sales);
        document.getElementById('salesOrders').textContent = sales.total_orders.toLocaleString();
        document.getElementById('salesItems').textContent = sales.total_items_sold.toLocaleString();
        
        // Update chart - match admin dashboard style
        const container = document.getElementById('salesChartContainer');
        const canvas = document.getElementById('salesChart');
        
        if (!sales.monthly_data || sales.monthly_data.length === 0) {
            if (salesChart) salesChart.destroy();
            container.innerHTML = '<div style="text-align:center; color:#6b7280; padding:20px;">No sales data yet</div>';
            return;
        }
        
        if (salesChart) salesChart.destroy();
        
        const ctx = canvas.getContext('2d');
        // Format labels for better readability
        const labels = sales.monthly_data.map(d => {
            // Format month label (e.g., "2024-01" -> "Jan 2024")
            if (d.month && d.month.includes('-')) {
                const [year, month] = d.month.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return monthNames[parseInt(month) - 1] + ' ' + year;
            }
            return d.month || '';
        }).reverse();
        const salesData = sales.monthly_data.map(d => parseFloat(d.sales || 0)).reverse();
        
        // Calculate max value for better scaling
        const maxSales = Math.max(...salesData, 0);
        const suggestedMax = maxSales > 0 ? Math.ceil(maxSales * 1.2) : 100;
        
        salesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales',
                    data: salesData,
                    backgroundColor: 'rgba(255, 43, 172, 0.6)',
                    borderColor: 'rgba(255, 43, 172, 1)',
                    borderWidth: 2,
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 'flex',
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                const v = context.parsed.y || 0;
                                return 'Sales: ₱' + v.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: suggestedMax,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            callback: function(value) {
                                return '₱' + value.toFixed(0);
                            },
                            stepSize: suggestedMax > 100 ? Math.ceil(suggestedMax / 10) : 10
                        }
                    }
                }
            }
        });
    }
    
    function updateUserAnalytics(users) {
        document.getElementById('usersTotal').textContent = users.total_users.toLocaleString();
        document.getElementById('usersNewMonth').textContent = users.new_users_month.toLocaleString();
        
        const growth = users.new_users_last_month > 0 
            ? ((users.new_users_month - users.new_users_last_month) / users.new_users_last_month * 100).toFixed(1)
            : users.new_users_month > 0 ? '100' : '0';
        document.getElementById('usersGrowth').textContent = growth + '%';
        
        // Update chart - match admin dashboard style
        const container = document.getElementById('usersChartContainer');
        const canvas = document.getElementById('usersChart');
        
        if (!users.user_growth || users.user_growth.length === 0) {
            if (usersChart) usersChart.destroy();
            container.innerHTML = '<div style="text-align:center; color:#6b7280; padding:20px;">No user data yet</div>';
            return;
        }
        
        if (usersChart) usersChart.destroy();
        
        const ctx = canvas.getContext('2d');
        // Format labels for better readability
        const labels = users.user_growth.map(d => {
            // Format month label (e.g., "2024-01" -> "Jan 2024")
            if (d.month && d.month.includes('-')) {
                const [year, month] = d.month.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return monthNames[parseInt(month) - 1] + ' ' + year;
            }
            return d.month || '';
        }).reverse();
        const userData = users.user_growth.map(d => parseInt(d.new_users || 0)).reverse();
        
        // Calculate max value for better scaling
        const maxUsers = Math.max(...userData, 0);
        const suggestedMaxUsers = maxUsers > 0 ? Math.ceil(maxUsers * 1.2) : 10;
        
        usersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'New Users',
                    data: userData,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 2,
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 'flex',
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                return 'New Users: ' + context.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: suggestedMaxUsers,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    function updateOrderStatistics(orders) {
        // Update chart - match admin dashboard style
        const container = document.getElementById('ordersChartContainer');
        const canvas = document.getElementById('ordersChart');
        
        if (!orders.status_breakdown || orders.status_breakdown.length === 0) {
            if (ordersChart) ordersChart.destroy();
            container.innerHTML = '<div style="text-align:center; color:#6b7280; padding:20px;">No order data yet</div>';
            return;
        }
        
        if (ordersChart) ordersChart.destroy();
        
        const ctx = canvas.getContext('2d');
        const labels = orders.status_breakdown.map(d => d.status.charAt(0).toUpperCase() + d.status.slice(1));
        const orderData = orders.status_breakdown.map(d => parseInt(d.count || 0));
        const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
        
        ordersChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: orderData,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 3,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            font: { size: 12 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return label + ': ' + value + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    }
    
    function updateRevenueReport(revenue) {
        document.getElementById('revenueTotal').textContent = formatCurrency(revenue.total_revenue);
        document.getElementById('revenueAdmin').textContent = formatCurrency(revenue.total_admin_commission);
        document.getElementById('revenueSeller').textContent = formatCurrency(revenue.total_seller_earnings);
        
        // Update chart - match admin dashboard style
        const container = document.getElementById('revenueChartContainer');
        const canvas = document.getElementById('revenueChart');
        
        if (!revenue.monthly_data || revenue.monthly_data.length === 0) {
            if (revenueChart) revenueChart.destroy();
            container.innerHTML = '<div style="text-align:center; color:#6b7280; padding:20px;">No revenue data yet</div>';
            return;
        }
        
        if (revenueChart) revenueChart.destroy();
        
        const ctx = canvas.getContext('2d');
        // Format labels for better readability
        const labels = revenue.monthly_data.map(d => {
            // Format month label (e.g., "2024-01" -> "Jan 2024")
            if (d.month && d.month.includes('-')) {
                const [year, month] = d.month.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return monthNames[parseInt(month) - 1] + ' ' + year;
            }
            return d.month || '';
        }).reverse();
        const revenueData = revenue.monthly_data.map(d => parseFloat(d.revenue || 0)).reverse();
        const commissionData = revenue.monthly_data.map(d => parseFloat(d.admin_commission || 0)).reverse();
        
        // Calculate max value for better scaling
        const maxRevenue = Math.max(...revenueData, ...commissionData, 0);
        const suggestedMaxRevenue = maxRevenue > 0 ? Math.ceil(maxRevenue * 1.2) : 100;
        
        revenueChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Total Revenue',
                        data: revenueData,
                        backgroundColor: 'rgba(255, 43, 172, 0.6)',
                        borderColor: 'rgba(255, 43, 172, 1)',
                        borderWidth: 2,
                        borderRadius: 4,
                        borderSkipped: false,
                        barThickness: 'flex',
                        maxBarThickness: 50
                    },
                    {
                        label: 'Admin Commission',
                        data: commissionData,
                        backgroundColor: 'rgba(139, 92, 246, 0.6)',
                        borderColor: 'rgba(139, 92, 246, 1)',
                        borderWidth: 2,
                        borderRadius: 4,
                        borderSkipped: false,
                        barThickness: 'flex',
                        maxBarThickness: 50
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            padding: 15,
                            font: { size: 12 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                const v = context.parsed.y || 0;
                                return context.dataset.label + ': ₱' + v.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: suggestedMaxRevenue,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#6b7280',
                            callback: function(value) {
                                return '₱' + value.toFixed(0);
                            },
                            stepSize: suggestedMaxRevenue > 100 ? Math.ceil(suggestedMaxRevenue / 10) : 10
                        }
                    }
                }
            }
        });
    }
    
    function updateSellerPerformance(sellers) {
        document.getElementById('sellersTotal').textContent = sellers.total_sellers.toLocaleString();
        document.getElementById('sellersActive').textContent = sellers.active_sellers.toLocaleString();
        
        const tbody = document.getElementById('topSellersTable');
        if (sellers.top_sellers && sellers.top_sellers.length > 0) {
            tbody.innerHTML = sellers.top_sellers.map(seller => `
                <tr>
                    <td><strong>${escapeHtml(seller.seller_name || 'N/A')}</strong></td>
                    <td>${parseInt(seller.total_orders || 0).toLocaleString()}</td>
                    <td>${formatCurrency(parseFloat(seller.total_sales || 0))}</td>
                    <td>${formatCurrency(parseFloat(seller.seller_earnings || 0))}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No seller data available</td></tr>';
        }
    }
    
    function updateRiderPerformance(riders) {
        document.getElementById('ridersTotal').textContent = riders.total_riders.toLocaleString();
        document.getElementById('ridersDeliveries').textContent = riders.total_deliveries.toLocaleString();
        document.getElementById('ridersCompleted').textContent = riders.completed_deliveries.toLocaleString();
        document.getElementById('ridersAvgTime').textContent = Math.round(riders.avg_delivery_time || 0) + ' min';
        
        const tbody = document.getElementById('topRidersTable');
        if (riders.top_riders && riders.top_riders.length > 0) {
            tbody.innerHTML = riders.top_riders.map(rider => `
                <tr>
                    <td><strong>${escapeHtml(rider.rider_name || 'N/A')}</strong></td>
                    <td>${parseInt(rider.deliveries || 0).toLocaleString()}</td>
                    <td>${parseInt(rider.completed || 0).toLocaleString()}</td>
                    <td>${formatCurrency(parseFloat(rider.total_earnings || 0))}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No rider data available</td></tr>';
        }
    }
    
    function formatCurrency(amount) {
        return '₱' + parseFloat(amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function getAuthToken() {
        return localStorage.getItem('auth_token') || '';
    }
    
    // Make loadReports globally accessible for retry button
    window.loadReports = loadReports;
})();

