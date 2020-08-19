window.onload = () => {
    setInterval(reload, 30000);
}

function reload() {
    var params = new URLSearchParams(window.location.search);
    if (params.has('refresh')) {
        location.reload();
    } else {
        window.location.href = window.location.pathname + window.location.search + '&refresh=1'
    }
}