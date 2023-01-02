const username = document.getElementById("usernameForm");

username.addEventListener("submit", function(e) {
    e.preventDefault();

    const inputUser = this.querySelector("#user");
    if(!inputUser.value)
        return;
    
    window.location.href = `/chat?username=${inputUser.value}`;
});
