let RosterApi = `https://jsonplaceholder.typicode.com/users`;

let clockApi = `https://worldtimeapi.org/api/timezone/Asia/Kolkata`;

const providerSelect = document.getElementById("providerSelect");
const dateInput = document.getElementById("dateInput");
const loadSlotsBtn = document.getElementById("loadSlotsBtn");
const refreshBtn = document.getElementById("refreshBtn");
const slotsGrid = document.getElementById("slotsGrid");
const slotsHeadline = document.getElementById("slotsHeadline");
const slotMeta = document.getElementById("slotMeta");
const bookingsList = document.getElementById("bookingsList");
const clearBookingsBtn = document.getElementById("clearBookingsBtn");
const statProviders = document.getElementById("statProviders");
const statBookings = document.getElementById("statBookings");
const statClock = document.getElementById("statClock");
const lastSync = document.getElementById("lastSync");

// Modal elements
const confirmModal = new bootstrap.Modal(
  document.getElementById("confirmModal")
);
const confirmTitle = document.getElementById("confirmTitle");
const confirmMeta = document.getElementById("confirmMeta");
const confirmBtn = document.getElementById("confirmBtn");
const notesInput = document.getElementById("notesInput");

// Global state ☝️

const state = {
    providers : [],
    nowUTC : null,
    target : null,
    bookings : [],
    pendingSlot : []
}

let saveBooking = () => {
    localStorage.setItem('bookings', JSON.stringify(state.bookings));
    statBookings.textContent = state.bookings.length;
}

let readingBooking = () => {
    state.bookings = JSON.parse(localStorage.getItem('bookings')) || [];
}

// api call for provider

let fetchProvider = async () => {
    providerSelect.disabled = true;
    providerSelect.innerHTML = `<option> Loading roster... </opton>`
    try {
        let res = await fetch(RosterApi);
        let data = await res.json();
        state.providers = data.map((i) => ({
            id : i.id, 
            name : i.name,
            specialty: i.company?.bs || "Generalist",
            city: i.address?.city || "Remote",
        }))    
       
        statProviders.textContent = state.providers.length;
        renderProviderSelect()
    } catch (error) {
        providerSelect.innerHTML = `<option> Error Loading.. </option>`
        console.log(error);
        
    }
}

let renderProviderSelect = () => {
    providerSelect.disabled = false;
    providerSelect.innerHTML = `<option value="">Select Provider</option>`
    state.providers.forEach((i)=>{
        let opt = document.createElement('option');
        opt.value = i.id;
        opt.textContent = `${i.name} - ${i.specialty}`
        providerSelect.append(opt);
    })
}

fetchProvider()

// api call for clock

let syncClock = async () => {
   try{
    let res = await fetch(clockApi);
    let data = await res.json();
    state.nowUTC = new Date(data.datetime);
    statClock.textContent = state.nowUTC.toLocaleTimeString("en-IN" ,{
        hour : "2-digit",
        minute : "2-digit",
        second : "2-digit",
    })
    lastSync.textContent = `Last synced ${new Date().toLocaleString("en-IN")}`
   }catch(error){
    console.log(error);
    state.nowUTC = new Date();
   statClock.textContent = state.nowUTC.toLocaleTimeString("en-IN")
   lastSync.textContent = `Last synced ${new Date().toLocaleString("en-IN")}`

   }

}

syncClock()

// clock part done ☝️

let setMinDate = () => {
    let today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
    dateInput.value = today;
}

// setMinDate() 

let buildSlots = (date) => {
    const slots = [];
     for (let hour = 9; hour <= 17; hour++) {
    ["00", "30"].forEach((minute) => {
      const label = `${String(hour).padStart(2, "0")}:${minute}`; // 09:00, 09:30, etc.
      slots.push(label);
    });
    }

    return slots.map((label) => ({
        label,
        disabled: isSlotDisabled(date, label),
    }));
}

let isSlotDisabled = (date, label) => {
    const targetDate = new Date(`${date}T${label}:00+05:30`);
    const now = state.nowUTC || new Date();
    if(targetDate < now ){
        return true;
    }

    const alreadyBooked = state.bookings.some((i)=>{ i.date === date && i.slot === label && i.providerID === state.target.providerId })
    return alreadyBooked;
}

const  renderSlots = (providerId, date) => {
  const provider = state.providers.find((p) => p.id === Number(providerId));

  if (!provider || !date) {
    slotsGrid.innerHTML = `<div class="col-12 text-center text-secondary">Select a provider and date to view availability.</div>`;
    return;
  }

  state.target = { providerId: provider.id, providerName: provider.name, date };

  slotsHeadline.textContent = `Slots for ${provider.name}`;
  slotMeta.textContent = `${new Date(
    date
  ).toDateString()} • refreshed ${new Date().toLocaleTimeString("en-IN")}`;

  const slots = buildSlots(date);

  slotsGrid.innerHTML = "";

  slots.forEach((slot) => {
    const col = document.createElement("div");
    col.className = "col-6 col-xl-4";

    const card = document.createElement("div");
    card.className = `slot-card h-100 ${slot.disabled ? "disabled" : ""}`;
    card.innerHTML = `
      <div class="fw-semibold">${slot.label}</div>
      <div class="small text-secondary">${
        slot.disabled ? "Unavailable" : "Tap to book"
      }</div>
    `;

    if (!slot.disabled) {
      card.onclick = () => openModal(provider, date, slot.label);
    }

    col.appendChild(card);
    slotsGrid.appendChild(col);
  });
}

function openModal(provider, date, slotLabel) {
  state.pendingSlot = { provider, date, slotLabel };

  confirmTitle.textContent = provider.name;
  confirmMeta.textContent = `${date} · ${slotLabel} IST`;
  notesInput.value = "";

  confirmModal.show();
}

confirmBtn.addEventListener("click", () => {
    if(!state.pendingSlot) return;

    const payload = {
        id : crypto.randomUUID(),
        providerID : state.pendingSlot.provider.id,
        provider : state.pendingSlot.provider.name,
        specialty:state.pendingSlot.provider.specialty,
        date : state.pendingSlot.date,
        slot : state.pendingSlot.slotLabel,
        notes : notesInput.value.trim(),    
    }
    state.bookings.push(payload);

    // Send email notification for new booking
    sendEmailNotification("Booked", payload);

    saveBooking();
    renderSlots(state.pendingSlot.provider.id, state.pendingSlot.date);
    renderBookings();
    confirmModal.hide();
})

// done

const sendEmailNotification = (action, bookingDetails) => {

  // This ID comes from the "Email Services" tab in your EmailJS account.
  const serviceID = "service_afckyci"; // This seems correct for your Service ID.
 
  // This is the ID of the template you just created in EmailJS.
  const templateID = "template_vc9u8bc"; // <-- PASTE YOUR NEW TEMPLATE ID HERE

  const templateParams = {
    action: action, // e.g., 'Booked' or 'Canceled'
    provider_name: bookingDetails.provider,
    booking_date: bookingDetails.date,
    booking_time: bookingDetails.slot,
    user_notes: bookingDetails.notes || "N/A",
  };

  emailjs.send(serviceID, templateID, templateParams).then(
    (res) => console.log("Email successfully sent!", res.status, res.text),
    (err) => console.error("Failed to send email. Error: ", err)
  );
};
const renderBookings = () => {
  bookingsList.innerHTML = "";

  // Empty state message
  if (!state.bookings.length) {
    bookingsList.innerHTML = `<div class="text-secondary small">No bookings yet.</div>`;
    return;
  }

   state.bookings
    .slice()
    .sort((a, b) => `${a.date}${a.slot}`.localeCompare(`${b.date}${b.slot}`))
    .forEach((booking) => {
      const card = document.createElement("div");
      card.className = "booking-card";

      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-semibold">${booking.provider}</div>
            <div class="small text-secondary">${booking.date} · ${
        booking.slot
      }</div>
            <div class="small text-muted">${booking.notes || "No notes"}</div>
          </div>

          <button class="btn btn-sm btn-outline-danger" data-id="${booking.id}">
            <i class="bi bi-x"></i>
          </button>
        </div>
      `;

      // Remove booking on click
      card.querySelector("button").onclick = () => cancelBooking(booking.id);

      bookingsList.appendChild(card);
    });
}

const cancelBooking = (bookingId) => {
  const bookingToCancel = state.bookings.find((b) => b.id === bookingId);
  if (!bookingToCancel) return;

  // Send email notification for cancellation
  sendEmailNotification("Canceled", bookingToCancel);

  state.bookings = state.bookings.filter((b) => b.id !== bookingId);

  saveBooking();
  renderBookings();

  if (state.target) {
    renderSlots(state.target.providerId, state.target.date);
  }
};

clearBookingsBtn.addEventListener("click", () => {
  if(!state.bookings.length){
    return
  }

  if(confirm("Are you sure you want to clear all bookings?")){
    // Send a cancellation email for each booking before clearing
    state.bookings.forEach(booking => {
      sendEmailNotification("Canceled", booking);
    });

    state.bookings = [];
    saveBooking();
    renderBookings();
    if(state.target) renderSlots(state.target.providerId, state.target.date);
  }
});

loadSlotsBtn.addEventListener("click", async() => {
  const providerId = providerSelect.value;
  const date = dateInput.value;

  if (!providerId || !date) {
    alert("Please select a provider and date.");
    return;
  }
await syncClock();
  renderSlots(providerId, date);
});

refreshBtn.addEventListener("click", async () => {
  await syncClock();
  if (state.target) {
    renderSlots(state.target.providerId, state.target.date);
  } 
});

const init = async () => {
    readingBooking();
    statBookings.textContent = state.bookings.length;
    setMinDate()
    
    // IMPORTANT: Replace with your EmailJS Public Key from your account settings
    // It can be found under the "API Keys" tab
    emailjs.init({ publicKey: "GXqZxSvA0mpVpgY4E" }); 

    await Promise.all([fetchProvider(), syncClock()]);

}

document.addEventListener("DOMContentLoaded", init);
